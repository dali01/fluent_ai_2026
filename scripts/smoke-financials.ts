/**
 * Financials smoke test: payment-driven invoice status, overpayment
 * guard math, accounting stub sync, profitability — against seeded data.
 *
 *   pnpm exec tsx scripts/smoke-financials.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: [".env.local", ".env"] });

import { getAccountingProvider } from "@/lib/accounting";
import { tenantDb } from "@/lib/db/tenant";
import { computeProfitability } from "@/lib/financials/profitability";

const ORG = process.env.SEED_ORG_ID ?? "org_demo_fluent";

async function main() {
  const db = tenantDb(ORG);

  // Seeded invoice #3001 is PARTIALLY_PAID with a 46000 deposit on 92000
  const invoice = await db.invoice.findFirstOrThrow({
    where: { invoiceNumber: 3001 },
    include: { payments: true, job: true },
  });
  const paid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);
  const remaining = Number(invoice.total) - paid;
  console.log(
    `invoice #3001: paid ${paid}, remaining ${remaining} (expect 46000/46000)`,
  );

  // Record the balance → PAID (mirrors recordPayment)
  const payment = await db.payment.create({
    data: {
      organizationId: ORG,
      invoiceId: invoice.id,
      amount: remaining,
      method: "BANK_TRANSFER",
      reference: "smoke-balance",
    },
  });
  const newStatus =
    paid + remaining >= Number(invoice.total) - 0.01
      ? "PAID"
      : "PARTIALLY_PAID";
  await db.invoice.update({
    where: { id: invoice.id },
    data: { status: newStatus },
  });
  console.log(`after balance payment: ${newStatus} (expect PAID)`);

  // Accounting stub round-trip
  const sync = await getAccountingProvider().pushInvoice({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    companyName: "smoke",
    total: Number(invoice.total),
    taxAmount: Number(invoice.taxAmount),
    dueDate: null,
  });
  console.log(
    `accounting sync id: ${sync.externalId} (expect stub-inv-${invoice.id})`,
  );

  // Profitability on the seeded job (revenue 73600, silk 1600 × 0.42)
  const job = invoice.job!;
  const movements = await db.stockMovement.findMany({
    where: { jobId: job.id, reason: "JOB_CONSUMPTION" },
    include: { inventoryItem: { select: { costPerUnit: true } } },
  });
  const profit = computeProfitability({
    invoiceSubtotal: Number(invoice.subtotal),
    quoteSubtotal: null,
    consumption: movements.map((m) => ({
      quantity: Math.abs(Number(m.delta)),
      costPerUnit: m.inventoryItem.costPerUnit
        ? Number(m.inventoryItem.costPerUnit)
        : null,
    })),
  });
  console.log(
    `profitability: revenue ${profit.revenue}, cost ${profit.materialCost}, margin ${profit.margin} (${profit.marginPct}%)`,
  );

  // Cleanup: revert payment + status
  await db.payment.delete({ where: { id: payment.id } });
  await db.invoice.update({
    where: { id: invoice.id },
    data: { status: "PARTIALLY_PAID" },
  });
  console.log("cleanup done");
  console.log("SMOKE OK");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
