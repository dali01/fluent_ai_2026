/**
 * Prospecting smoke test — the dedupe proof and the kanban fence,
 * against the seeded local DB. Mirrors scripts/smoke-crm.ts.
 *
 *   pnpm exec tsx scripts/smoke-prospecting.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: [".env.local", ".env"] });

import {
  readProspectingConfig,
  writeProspectingConfig,
} from "@/lib/db/org-settings";
import { tenantDb } from "@/lib/db/tenant";
import { ingestBatch } from "@/lib/prospecting/ingest";
import { parseOpenFdaResponse } from "@/lib/prospecting/sources/openfda";
import { LEAD_STAGES } from "@/lib/validation/crm";

const ORG = process.env.SEED_ORG_ID ?? "org_demo_fluent";

const FDA_FIXTURE = {
  results: [
    {
      application_number: "ANDA777001",
      sponsor_name: "Smoke Pharma AB",
      submissions: [
        {
          submission_type: "ORIG",
          submission_number: "1",
          submission_status: "AP",
          submission_status_date: "20260725",
        },
      ],
      products: [
        {
          brand_name: "Smokazol",
          dosage_form: "TABLET",
          route: "ORAL",
          marketing_status: "Prescription",
        },
      ],
    },
    {
      application_number: "ANDA777002",
      sponsor_name: "Bulk Chemicals Corp",
      submissions: [
        {
          submission_type: "ORIG",
          submission_number: "1",
          submission_status: "AP",
          submission_status_date: "20260726",
        },
      ],
      products: [
        {
          brand_name: "BulkStuff",
          dosage_form: "BULK INGREDIENT", // screened out
          marketing_status: "Prescription",
        },
      ],
    },
  ],
};

async function main() {
  const db = tenantDb(ORG);
  const now = new Date();

  // Enable prospecting for the run
  const config = await readProspectingConfig(ORG);
  await writeProspectingConfig(ORG, { ...config, enabled: true });
  const activeConfig = await readProspectingConfig(ORG);

  // Parse fixture through the real parser
  const prospects = parseOpenFdaResponse(FDA_FIXTURE);
  console.log(`parsed from fixture: ${prospects.length} (expect 2)`);

  // First ingest: 1 created (tablet), 1 screened out (bulk)
  const first = await ingestBatch(ORG, "fda", prospects, activeConfig, now);
  console.log(
    `first ingest: created=${first.created} screenedOut=${first.screenedOut} duplicates=${first.duplicates} (expect 1/1/0)`,
  );

  // THE DEDUPE PROOF: identical batch again → 0 created, 1 duplicate
  const second = await ingestBatch(ORG, "fda", prospects, activeConfig, now);
  console.log(
    `second ingest: created=${second.created} duplicates=${second.duplicates} (expect 0/1)`,
  );

  // Kanban fence: no prospect appears in the pipeline-board query
  const boardLeads = await db.lead.findMany({
    where: { deletedAt: null, stage: { in: [...LEAD_STAGES] } },
    select: { id: true, stage: true },
  });
  const leaked = boardLeads.filter((l) => (l.stage as string) === "PROSPECT");
  console.log(
    `pipeline board sees ${boardLeads.length} kanban leads, ${leaked.length} prospects (expect 0 prospects)`,
  );

  // Qualify flow (mirrors qualifyProspect): company + stage move
  const prospect = await db.lead.findFirstOrThrow({
    where: { externalId: "ANDA777001:ORIG1" },
  });
  const company = await db.company.create({
    data: {
      organizationId: ORG,
      name: prospect.notes ?? prospect.title,
      tags: ["prospecting"],
    },
  });
  await db.lead.update({
    where: { id: prospect.id },
    data: { stage: "QUOTE_REQUESTED", companyId: company.id },
  });
  const qualified = await db.lead.findUniqueOrThrow({
    where: { id: prospect.id },
  });
  console.log(
    `qualified: stage=${qualified.stage}, company=${company.name} (expect QUOTE_REQUESTED)`,
  );

  // Cross-tenant probe (copied from smoke-crm)
  const foreign = tenantDb("org_someone_else");
  const foreignProspects = await foreign.lead.findMany({
    where: { stage: "PROSPECT" },
  });
  console.log(
    `foreign org sees ${foreignProspects.length} prospects (expect 0)`,
  );

  // Cleanup
  await db.lead.delete({ where: { id: prospect.id } });
  await db.company.delete({ where: { id: company.id } });
  await db.activityLog.deleteMany({
    where: { summary: { contains: "Smoke Pharma" } },
  });
  await writeProspectingConfig(ORG, config);
  console.log("cleanup done");
  console.log("SMOKE OK");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
