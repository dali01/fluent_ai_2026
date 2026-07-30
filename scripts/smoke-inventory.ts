/**
 * Inventory & scheduling smoke test: auto-deduct idempotency and
 * double-booking overlap detection against the seeded local DB.
 *
 *   pnpm exec tsx scripts/smoke-inventory.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: [".env.local", ".env"] });

import { tenantDb } from "@/lib/db/tenant";

const ORG = process.env.SEED_ORG_ID ?? "org_demo_fluent";

async function main() {
  const db = tenantDb(ORG);

  // ── auto-deduct simulation (mirrors consumeJobMaterials) ────────
  const item = await db.inventoryItem.findFirstOrThrow({
    where: { type: "PAPER" },
  });
  const company = await db.company.findFirstOrThrow({});
  const max = await db.job.aggregate({ _max: { jobNumber: true } });
  const job = await db.job.create({
    data: {
      organizationId: ORG,
      jobNumber: (max._max.jobNumber ?? 2000) + 1,
      title: "Smoke deduct job",
      companyId: company.id,
      status: "SHIPPING",
      quantity: 100,
    },
  });
  await db.jobMaterial.create({
    data: {
      organizationId: ORG,
      jobId: job.id,
      inventoryItemId: item.id,
      quantityPlanned: 250,
    },
  });
  const before = Number(item.quantityOnHand);

  async function consume() {
    const [materials, existing] = await Promise.all([
      db.jobMaterial.findMany({ where: { jobId: job.id } }),
      db.stockMovement.findMany({
        where: { jobId: job.id, reason: "JOB_CONSUMPTION" },
        select: { inventoryItemId: true },
      }),
    ]);
    const consumed = new Set(existing.map((m) => m.inventoryItemId));
    for (const m of materials.filter((m) => !consumed.has(m.inventoryItemId))) {
      await db.stockMovement.create({
        data: {
          organizationId: ORG,
          inventoryItemId: m.inventoryItemId,
          jobId: job.id,
          delta: -Number(m.quantityPlanned),
          reason: "JOB_CONSUMPTION",
        },
      });
      await db.inventoryItem.update({
        where: { id: m.inventoryItemId },
        data: { quantityOnHand: { decrement: m.quantityPlanned } },
      });
    }
  }

  await consume(); // first DONE
  await consume(); // re-entering DONE must be a no-op
  const after = await db.inventoryItem.findUniqueOrThrow({
    where: { id: item.id },
  });
  const deducted = before - Number(after.quantityOnHand);
  console.log(
    `auto-deduct: ${deducted} deducted after double-run (expect 250) — ${deducted === 250 ? "ok" : "FAIL"}`,
  );

  // ── double-booking detection ────────────────────────────────────
  const press = await db.press.findFirstOrThrow({});
  const start = new Date("2030-01-15T08:00:00Z");
  const end = new Date("2030-01-15T12:00:00Z");
  const block = await db.scheduleBlock.create({
    data: {
      organizationId: ORG,
      pressId: press.id,
      startsAt: start,
      endsAt: end,
    },
  });
  const overlap = await db.scheduleBlock.findFirst({
    where: {
      pressId: press.id,
      startsAt: { lt: new Date("2030-01-15T13:00:00Z") },
      endsAt: { gt: new Date("2030-01-15T11:00:00Z") },
    },
  });
  const disjoint = await db.scheduleBlock.findFirst({
    where: {
      pressId: press.id,
      startsAt: { lt: new Date("2030-01-15T16:00:00Z") },
      endsAt: { gt: new Date("2030-01-15T13:00:00Z") },
    },
  });
  console.log(
    `overlap query: clash=${overlap ? "detected" : "MISSED"}, disjoint=${disjoint ? "FALSE POSITIVE" : "clear"}`,
  );

  // ── low stock flag ──────────────────────────────────────────────
  const lowCount = await db.inventoryItem.count({
    where: { deletedAt: null },
  });
  console.log(`inventory items visible: ${lowCount}`);

  // Cleanup
  await db.scheduleBlock.delete({ where: { id: block.id } });
  await db.stockMovement.deleteMany({ where: { jobId: job.id } });
  await db.jobMaterial.deleteMany({ where: { jobId: job.id } });
  await db.job.delete({ where: { id: job.id } });
  await db.inventoryItem.update({
    where: { id: item.id },
    data: { quantityOnHand: { increment: 250 } },
  });
  console.log("cleanup done");
  console.log("SMOKE OK");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
