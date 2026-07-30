/**
 * CRM smoke test: runs the exact query shapes the Phase 2 pages use against
 * the seeded database, through the tenant layer, plus live cross-tenant
 * isolation probes. Run after `pnpm db:seed`:
 *
 *   pnpm exec tsx scripts/smoke-crm.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: [".env.local", ".env"] });

import { tenantDb } from "@/lib/db/tenant";
import { TenantIsolationError } from "@/lib/db/tenant-scope";

const ORG = process.env.SEED_ORG_ID ?? "org_demo_fluent";

async function main() {
  const db = tenantDb(ORG);

  // companies list page query
  const companies = await db.company.findMany({
    where: { deletedAt: null, name: { contains: "a", mode: "insensitive" } },
    include: {
      priceTier: true,
      _count: { select: { contacts: { where: { deletedAt: null } } } },
    },
    orderBy: { name: "asc" },
  });
  console.log(
    `companies: ${companies.map((c) => `${c.name}(${c._count.contacts})`).join(", ")}`,
  );

  // company detail query
  const detail = await db.company.findUnique({
    where: { id: companies[0].id },
    include: {
      priceTier: true,
      contacts: { where: { deletedAt: null }, orderBy: { lastName: "asc" } },
    },
  });
  console.log(
    `detail: ${detail?.name}, tier=${detail?.priceTier?.name}, contacts=${detail?.contacts.length}`,
  );

  // contacts list page query with tag filter
  const contacts = await db.contact.findMany({
    where: { deletedAt: null, tags: { has: "decision-maker" } },
    include: { company: { select: { id: true, name: true } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  console.log(
    `tagged contacts: ${contacts.map((c) => c.firstName).join(", ")}`,
  );

  // pipeline page query
  const leads = await db.lead.findMany({
    where: { deletedAt: null },
    include: {
      company: { select: { name: true } },
      contact: { select: { firstName: true, lastName: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  console.log(
    `leads: ${leads.map((l) => `${l.title}@${l.stage}`).join(" | ")}`,
  );

  // activity timeline query
  const activity = await db.activityLog.findMany({
    where: { contactId: contacts[0]?.id ?? "none" },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  console.log(
    `activity rows for ${contacts[0]?.firstName}: ${activity.length}`,
  );

  // lead stage move (what drag-drop calls) + revert
  const lead = leads[0];
  await db.lead.update({ where: { id: lead.id }, data: { stage: "QUOTED" } });
  const moved = await db.lead.findUnique({ where: { id: lead.id } });
  await db.lead.update({ where: { id: lead.id }, data: { stage: lead.stage } });
  console.log(`stage move: ${lead.stage} -> ${moved?.stage} -> reverted`);

  // isolation: another org sees NOTHING
  const foreign = tenantDb("org_someone_else");
  const foreignCompanies = await foreign.company.findMany({});
  console.log(
    `foreign org sees ${foreignCompanies.length} companies (expect 0)`,
  );
  const stolen = await foreign.company.findUnique({
    where: { id: companies[0].id },
  });
  console.log(
    `foreign findUnique by raw id: ${stolen === null ? "null (blocked)" : "LEAK!"}`,
  );
  try {
    await foreign.company.update({
      where: { id: companies[0].id },
      data: { name: "hacked" },
    });
    console.log("LEAK: cross-org update succeeded!");
  } catch {
    console.log("cross-org update: rejected (blocked)");
  }
  try {
    await foreign.contact.findMany({ where: { organizationId: ORG } });
    console.log("LEAK: spoofed where accepted!");
  } catch (e) {
    console.log(
      `spoofed where: ${e instanceof TenantIsolationError ? "TenantIsolationError (blocked)" : "other error"}`,
    );
  }

  console.log("SMOKE OK");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
