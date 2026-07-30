import { describe, expect, it } from "vitest";
import { computeProfitability } from "@/lib/financials/profitability";

describe("computeProfitability", () => {
  it("prefers invoice revenue over quote", () => {
    const p = computeProfitability({
      invoiceSubtotal: 10000,
      quoteSubtotal: 9000,
      consumption: [{ quantity: 1000, costPerUnit: 0.5 }],
    });
    expect(p.revenue).toBe(10000);
    expect(p.revenueSource).toBe("invoice");
    expect(p.materialCost).toBe(500);
    expect(p.margin).toBe(9500);
    expect(p.marginPct).toBe(95);
  });

  it("falls back to quote revenue", () => {
    const p = computeProfitability({
      invoiceSubtotal: null,
      quoteSubtotal: 9000,
      consumption: [],
    });
    expect(p.revenueSource).toBe("quote");
    expect(p.margin).toBe(9000);
  });

  it("flags incomplete cost when an item lacks unit cost", () => {
    const p = computeProfitability({
      invoiceSubtotal: 5000,
      quoteSubtotal: null,
      consumption: [
        { quantity: 100, costPerUnit: 2 },
        { quantity: 50, costPerUnit: null },
      ],
    });
    expect(p.materialCost).toBe(200);
    expect(p.costComplete).toBe(false);
  });

  it("handles no revenue at all", () => {
    const p = computeProfitability({
      invoiceSubtotal: null,
      quoteSubtotal: null,
      consumption: [{ quantity: 10, costPerUnit: 1 }],
    });
    expect(p.revenue).toBeNull();
    expect(p.margin).toBeNull();
    expect(p.marginPct).toBeNull();
    expect(p.materialCost).toBe(10);
  });
});
