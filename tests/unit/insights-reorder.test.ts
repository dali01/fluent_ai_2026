import { describe, expect, it } from "vitest";
import { scoreReorder, type OrderEvent } from "@/lib/insights/reorder";

const NOW = new Date("2026-07-30T12:00:00Z");

function orders(...isoDates: string[]): OrderEvent[] {
  return isoDates.map((d) => ({ at: new Date(`${d}T12:00:00Z`) }));
}

describe("scoreReorder", () => {
  it("returns null with fewer than two orders", () => {
    expect(scoreReorder([], NOW)).toBeNull();
    expect(scoreReorder(orders("2026-06-01"), NOW)).toBeNull();
  });

  it("returns null when all orders are same-day duplicates", () => {
    expect(
      scoreReorder(orders("2026-06-01", "2026-06-01", "2026-06-01"), NOW),
    ).toBeNull();
  });

  it("ignores orders dated in the future", () => {
    expect(scoreReorder(orders("2026-08-15", "2026-09-15"), NOW)).toBeNull();
  });

  it("is near zero right after an order", () => {
    // Monthly cadence, ordered yesterday
    const insight = scoreReorder(
      orders("2026-04-29", "2026-05-29", "2026-06-29", "2026-07-29"),
      NOW,
    )!;
    expect(insight.likelihood).toBe(0);
    expect(insight.medianIntervalDays).toBe(30);
    expect(insight.daysSinceLast).toBe(1);
    expect(insight.rationale).toContain("next order expected");
  });

  it("ramps up as the customer passes their cadence", () => {
    // Monthly cadence, last order 45 days ago → ratio 1.5 → ~0.9
    const insight = scoreReorder(
      orders("2026-03-17", "2026-04-16", "2026-05-16", "2026-06-15"),
      NOW,
    )!;
    expect(insight.dueRatio).toBe(1.5);
    expect(insight.likelihood).toBeCloseTo(0.9, 2);
    expect(insight.rationale).toContain("past their usual cadence");
  });

  it("caps likelihood below certainty when clearly overdue", () => {
    // ~31-day cadence, last order 60 days ago → ratio ~1.9, still "due"
    const insight = scoreReorder(orders("2026-04-30", "2026-05-31"), NOW)!;
    expect(insight.likelihood).toBe(0.95);
  });

  it("tapers a lapsed customer back to zero — churn owns them", () => {
    // Monthly cadence, silent ~7 months → lapsed, not "due"
    const insight = scoreReorder(orders("2025-12-01", "2026-01-01"), NOW)!;
    expect(insight.dueRatio).toBeGreaterThan(5);
    expect(insight.likelihood).toBe(0);
  });

  it("uses the median so one long gap does not skew the cadence", () => {
    // 30, 30, 300, 30 → median 30, not mean 97.5
    const insight = scoreReorder(
      orders(
        "2025-06-01",
        "2025-07-01",
        "2025-07-31",
        "2026-05-27",
        "2026-06-26",
      ),
      NOW,
    )!;
    expect(insight.medianIntervalDays).toBe(30);
  });

  it("is deterministic for identical inputs", () => {
    const input = orders("2026-05-01", "2026-06-01");
    expect(scoreReorder(input, NOW)).toEqual(scoreReorder(input, NOW));
  });
});
