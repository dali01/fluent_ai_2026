import { describe, expect, it } from "vitest";
import {
  byUrgency,
  forecastDemand,
  MIN_MONTHS,
  type ConsumptionEvent,
} from "@/lib/insights/demand";

/** 2026-07-15 — mid-month, so the partial month is exercised. */
const NOW = new Date("2026-07-15T12:00:00Z");

/** One consumption event per month, `months` months back from June 2026. */
function monthly(months: number, quantity: number): ConsumptionEvent[] {
  const out: ConsumptionEvent[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(2026, 5 - i, 10)); // June 2026 backwards
    out.push({ at: d, quantity });
  }
  return out;
}

const base = {
  itemName: "Silk 170gsm",
  quantityOnHand: 10_000,
  reorderThreshold: 5000,
  now: NOW,
};

describe("forecastDemand", () => {
  it("returns null with no consumption at all", () => {
    expect(forecastDemand({ ...base, consumption: [] })).toBeNull();
  });

  it("returns null when the only usage is this partial month", () => {
    // A half-finished month must not be read as a full one
    expect(
      forecastDemand({
        ...base,
        consumption: [{ at: new Date("2026-07-02T00:00:00Z"), quantity: 500 }],
      }),
    ).toBeNull();
  });

  it("averages complete months only", () => {
    const out = forecastDemand({
      ...base,
      consumption: [
        ...monthly(6, 1000),
        { at: new Date("2026-07-05T00:00:00Z"), quantity: 99_999 }, // partial
      ],
    })!;
    expect(out.monthsObserved).toBe(6);
    expect(out.monthlyAverage).toBe(1000);
  });

  it("reports days of cover against stock on hand", () => {
    const out = forecastDemand({ ...base, consumption: monthly(6, 3000) })!;
    expect(out.projectedNext30Days).toBe(3000);
    expect(out.daysOfCover).toBe(100); // 10 000 at 100/day
  });

  it("detects a rising trend from the last quarter", () => {
    const consumption = [
      ...monthly(3, 1000), // most recent three months
      ...monthly(6, 500).slice(3), // the three before
    ];
    const out = forecastDemand({ ...base, consumption })!;
    expect(out.trendRatio).toBeGreaterThan(1);
    expect(out.rationale).toContain("rising");
  });

  it("gives no trend without six complete months", () => {
    const out = forecastDemand({ ...base, consumption: monthly(4, 1000) })!;
    expect(out.trendRatio).toBeNull();
  });

  it("refuses a seasonal index under a year of history", () => {
    const out = forecastDemand({ ...base, consumption: monthly(8, 1000) })!;
    expect(out.seasonalIndex).toBeNull();
    expect(out.caveats.some((c) => c.includes("no seasonal adjustment"))).toBe(
      true,
    );
  });

  it("computes a seasonal index once a year exists", () => {
    const out = forecastDemand({ ...base, consumption: monthly(14, 1000) })!;
    expect(out.seasonalIndex).not.toBeNull();
  });

  it("warns when the history is too thin to lean on", () => {
    const out = forecastDemand({ ...base, consumption: monthly(2, 1000) })!;
    expect(out.monthsObserved).toBeLessThan(MIN_MONTHS);
    expect(out.caveats.some((c) => c.includes("indicative"))).toBe(true);
  });

  it("always states that supplier lead time is unknown", () => {
    const out = forecastDemand({ ...base, consumption: monthly(6, 1000) })!;
    expect(out.caveats.some((c) => c.includes("supplier lead time"))).toBe(
      true,
    );
  });

  it("flags stock already at or below the reorder point", () => {
    const out = forecastDemand({
      ...base,
      quantityOnHand: 4000,
      consumption: monthly(6, 1000),
    })!;
    expect(out.belowReorderPoint).toBe(true);
  });

  it("is deterministic for identical inputs", () => {
    const input = { ...base, consumption: monthly(6, 1234) };
    expect(forecastDemand(input)).toEqual(forecastDemand(input));
  });
});

describe("byUrgency", () => {
  it("puts the item running out soonest first", () => {
    const soon = forecastDemand({
      ...base,
      quantityOnHand: 1000,
      consumption: monthly(6, 3000),
    })!;
    const later = forecastDemand({
      ...base,
      quantityOnHand: 90_000,
      consumption: monthly(6, 3000),
    })!;
    expect([later, soon].sort(byUrgency)[0]).toBe(soon);
  });

  it("sorts items with no consumption rate last", () => {
    const measured = forecastDemand({ ...base, consumption: monthly(6, 100) })!;
    const idle = { ...measured, daysOfCover: null };
    expect([idle, measured].sort(byUrgency)[0]).toBe(measured);
  });
});
