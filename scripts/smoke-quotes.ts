/**
 * Quoting smoke test: price a quote through the engine with the org's
 * seeded rules + reseller tier, persist it, walk status transitions, and
 * convert to an invoice — through the tenant layer.
 *
 *   pnpm exec tsx scripts/smoke-quotes.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: [".env.local", ".env"] });

import { tenantDb } from "@/lib/db/tenant";
import { computeQuote, type EngineRule } from "@/lib/pricing/engine";

const ORG = process.env.SEED_ORG_ID ?? "org_demo_fluent";

async function main() {
  const db = tenantDb(ORG);

  const reseller = await db.company.findFirstOrThrow({
    where: { isReseller: true },
    include: { priceTier: true },
  });
  const rules = await db.pricingRule.findMany({ where: { active: true } });
  console.log(
    `company: ${reseller.name}, tier ×${reseller.priceTier?.multiplier}`,
  );
  console.log(`rules loaded: ${rules.length}`);

  const engineRules: EngineRule[] = rules.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    config: r.config,
  }));
  const computation = computeQuote(
    [
      {
        description: "A5 flyers 4/4",
        quantity: 5000,
        specs: { stock: "170gsm silk", finish: "matte laminate" },
      },
    ],
    engineRules,
    {
      rush: true,
      tierMultiplier: Number(reseller.priceTier?.multiplier ?? 1),
    },
  );
  console.log(
    `computed: unit ${computation.lines[0].unitPrice}, subtotal ${computation.subtotal}, rush ${computation.rushFee}, tier ${computation.tierAdjustment}, total ${computation.total}`,
  );
  if (computation.skippedRules.length > 0) {
    throw new Error(
      `rules skipped: ${JSON.stringify(computation.skippedRules)}`,
    );
  }

  // Persist as the action would
  const max = await db.quote.aggregate({ _max: { quoteNumber: true } });
  const quote = await db.quote.create({
    data: {
      organizationId: ORG,
      quoteNumber: (max._max.quoteNumber ?? 1000) + 1,
      companyId: reseller.id,
      priceTierId: reseller.priceTierId,
      subtotal: computation.subtotal,
      taxRate: computation.taxRate,
      taxAmount: computation.taxAmount,
      total: computation.total,
      pricingBreakdown: JSON.parse(JSON.stringify(computation)),
      lineItems: {
        create: computation.lines.map((line, i) => ({
          organizationId: ORG,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          total: line.total,
          sortOrder: i,
        })),
      },
    },
  });
  console.log(`quote persisted: #${quote.quoteNumber}`);

  // DRAFT -> SENT -> ACCEPTED -> invoice
  await db.quote.update({ where: { id: quote.id }, data: { status: "SENT" } });
  await db.quote.update({
    where: { id: quote.id },
    data: { status: "ACCEPTED" },
  });
  const maxInv = await db.invoice.aggregate({ _max: { invoiceNumber: true } });
  const invoice = await db.invoice.create({
    data: {
      organizationId: ORG,
      invoiceNumber: (maxInv._max.invoiceNumber ?? 3000) + 1,
      companyId: quote.companyId,
      quoteId: quote.id,
      status: "DRAFT",
      subtotal: quote.subtotal,
      taxAmount: quote.taxAmount,
      total: quote.total,
      depositAmount: Math.round(Number(quote.total) * 0.5 * 100) / 100,
    },
  });
  await db.quote.update({
    where: { id: quote.id },
    data: { status: "CONVERTED" },
  });
  console.log(
    `converted: invoice #${invoice.invoiceNumber}, deposit ${invoice.depositAmount} (expect 50% of ${quote.total})`,
  );

  // Cleanup
  await db.invoice.delete({ where: { id: invoice.id } });
  await db.quoteLineItem.deleteMany({ where: { quoteId: quote.id } });
  await db.quote.delete({ where: { id: quote.id } });
  console.log("cleanup done");
  console.log("SMOKE OK");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
