/**
 * Per-job profitability — pure math over already-loaded rows.
 *
 * Revenue: the job's invoice subtotal (ex VAT) when one exists, else the
 * linked quote's subtotal. Cost: JOB_CONSUMPTION stock movements priced
 * at the item's costPerUnit (labour tracking is future work — margins
 * here are material margins, and the UI says so).
 */

export type ProfitInput = {
  invoiceSubtotal: number | null;
  quoteSubtotal: number | null;
  consumption: Array<{ quantity: number; costPerUnit: number | null }>;
};

export type ProfitResult = {
  revenue: number | null;
  revenueSource: "invoice" | "quote" | null;
  materialCost: number;
  costComplete: boolean; // false when some consumed items lack a unit cost
  margin: number | null;
  marginPct: number | null;
};

export function computeProfitability(input: ProfitInput): ProfitResult {
  const revenue = input.invoiceSubtotal ?? input.quoteSubtotal ?? null;
  const revenueSource =
    input.invoiceSubtotal != null
      ? "invoice"
      : input.quoteSubtotal != null
        ? "quote"
        : null;

  let materialCost = 0;
  let costComplete = true;
  for (const row of input.consumption) {
    if (row.costPerUnit == null) {
      costComplete = false;
      continue;
    }
    materialCost += row.quantity * row.costPerUnit;
  }
  materialCost = Math.round(materialCost * 100) / 100;

  const margin =
    revenue != null ? Math.round((revenue - materialCost) * 100) / 100 : null;
  const marginPct =
    revenue != null && revenue > 0
      ? Math.round(((revenue - materialCost) / revenue) * 1000) / 10
      : null;

  return {
    revenue,
    revenueSource,
    materialCost,
    costComplete,
    margin,
    marginPct,
  };
}
