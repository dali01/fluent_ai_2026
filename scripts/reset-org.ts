/**
 * Wipe an organization's tenant data (companies, jobs, quotes, invoices,
 * inventory, prospects, scores — everything except the Organization row,
 * users and memberships). Used before re-seeding a demo org with a
 * different market dataset.
 *
 *   pnpm exec tsx scripts/reset-org.ts <orgId>
 *   USE_NEON=1 pnpm exec tsx scripts/reset-org.ts <orgId>   # target Neon
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: [".env.local", ".env"] });

if (process.env.USE_NEON && process.env.NEON_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.NEON_DATABASE_URL;
  process.env.DIRECT_URL = process.env.NEON_DATABASE_URL;
}

async function main() {
  const orgId = process.argv[2];
  if (!orgId?.startsWith("org_")) {
    throw new Error("usage: reset-org.ts <orgId>");
  }

  const { tenantDb } = await import("@/lib/db/tenant");
  const t = tenantDb(orgId);

  // Children before parents (FKs without cascade)
  await t.payment.deleteMany({});
  await t.proof.deleteMany({});
  await t.jobFile.deleteMany({});
  await t.scheduleBlock.deleteMany({});
  await t.stockMovement.deleteMany({});
  await t.jobMaterial.deleteMany({});
  await t.invoice.deleteMany({});
  await t.job.deleteMany({});
  await t.quoteLineItem.deleteMany({});
  await t.quote.deleteMany({});
  await t.leadScore.deleteMany({});
  await t.lead.deleteMany({});
  await t.activityLog.deleteMany({});
  await t.contact.deleteMany({});
  await t.company.deleteMany({});
  await t.sourceRun.deleteMany({});
  await t.aiTask.deleteMany({});
  await t.inventoryItem.deleteMany({});
  await t.press.deleteMany({});
  await t.vendor.deleteMany({});
  await t.pricingRule.deleteMany({});
  await t.priceTier.deleteMany({});

  console.log(`Reset complete for ${orgId} (org row + memberships kept).`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
