import { describe, expect, it } from "vitest";
import { computeQuote, type EngineRule } from "@/lib/pricing/engine";

const RULES: EngineRule[] = [
  {
    id: "r-qty",
    name: "Flyer quantity breaks",
    type: "QUANTITY_TIER",
    config: {
      tiers: [
        { minQty: 0, unitPrice: 4 },
        { minQty: 1000, unitPrice: 2.5 },
        { minQty: 5000, unitPrice: 1.8 },
      ],
    },
  },
  {
    id: "r-stock",
    name: "Silk surcharge",
    type: "STOCK",
    config: { stock: "silk", surchargePerUnit: 0.3 },
  },
  {
    id: "r-finish",
    name: "Matte laminate",
    type: "FINISHING",
    config: { finish: "laminate", perUnit: 0.5, flat: 200 },
  },
  {
    id: "r-rush",
    name: "Rush 25%",
    type: "RUSH_FEE",
    config: { percent: 25, flat: 0 },
  },
  {
    id: "r-setup",
    name: "Press setup",
    type: "SETUP_FEE",
    config: { flat: 500 },
  },
];

describe("computeQuote", () => {
  it("picks the right quantity tier", () => {
    const q = computeQuote([{ description: "Flyers", quantity: 5000 }], RULES, {
      taxRate: 0,
    });
    expect(q.lines[0].unitPrice).toBe(1.8);
    // 5000*1.8 + 500 setup
    expect(q.subtotal).toBe(9500);
  });

  it("applies stock surcharge and finishing", () => {
    const q = computeQuote(
      [
        {
          description: "Laminated silk flyers",
          quantity: 1000,
          specs: { stock: "170gsm Silk", finish: "matte laminate" },
        },
      ],
      RULES,
      { taxRate: 0 },
    );
    // unit 2.5 + 0.3 silk = 2.8 → 2800; finishing 0.5*1000+200 = 700 → 3500
    expect(q.lines[0].unitPrice).toBe(2.8);
    expect(q.lines[0].total).toBe(3500);
    expect(q.lines[0].applied.map((a) => a.type)).toEqual([
      "QUANTITY_TIER",
      "STOCK",
      "FINISHING",
    ]);
  });

  it("honors manual unit price override (skips tier rules)", () => {
    const q = computeQuote(
      [
        {
          description: "Custom die-cut",
          quantity: 100,
          unitPriceOverride: 12,
        },
      ],
      RULES,
      { taxRate: 0 },
    );
    expect(q.lines[0].unitPrice).toBe(12);
    expect(q.lines[0].total).toBe(1200);
  });

  it("adds rush fee only when rush is set", () => {
    const base = computeQuote(
      [{ description: "Flyers", quantity: 1000 }],
      RULES,
      { taxRate: 0 },
    );
    const rush = computeQuote(
      [{ description: "Flyers", quantity: 1000 }],
      RULES,
      { rush: true, taxRate: 0 },
    );
    // base: 2500 + 500 setup = 3000; rush: +25% = 750
    expect(base.rushFee).toBe(0);
    expect(rush.rushFee).toBe(750);
    expect(rush.total).toBe(3750);
  });

  it("applies reseller tier multiplier to goods+rush but not independently to tax", () => {
    const q = computeQuote([{ description: "Flyers", quantity: 1000 }], RULES, {
      tierMultiplier: 0.8,
      taxRate: 0.25,
    });
    // subtotal 3000 → after tier 2400 (adjustment -600) → tax 600 → total 3000
    expect(q.tierAdjustment).toBe(-600);
    expect(q.taxAmount).toBe(600);
    expect(q.total).toBe(3000);
  });

  it("computes Swedish VAT by default", () => {
    const q = computeQuote([{ description: "X", quantity: 1000 }], RULES);
    expect(q.taxRate).toBe(0.25);
    expect(q.taxAmount).toBe(750); // 25% of 3000
  });

  it("skips broken rule configs and reports them", () => {
    const broken: EngineRule[] = [
      ...RULES,
      { id: "r-bad", name: "Broken", type: "STOCK", config: { nope: true } },
    ];
    const q = computeQuote([{ description: "X", quantity: 10 }], broken, {
      taxRate: 0,
    });
    expect(q.skippedRules).toEqual([
      { ruleId: "r-bad", ruleName: "Broken", reason: "invalid config" },
    ]);
  });

  it("handles an empty quote", () => {
    const q = computeQuote([], [], {});
    expect(q.subtotal).toBe(0);
    expect(q.total).toBe(0);
  });
});
