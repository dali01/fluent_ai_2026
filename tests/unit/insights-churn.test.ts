import { describe, expect, it } from "vitest";
import { scoreChurn } from "@/lib/insights/churn";
import type { OrderEvent } from "@/lib/insights/reorder";

const NOW = new Date("2026-07-30T12:00:00Z");

function orders(...isoDates: string[]): OrderEvent[] {
  return isoDates.map((d) => ({ at: new Date(`${d}T12:00:00Z`) }));
}

describe("scoreChurn", () => {
  it("returns null for companies that never ordered", () => {
    expect(scoreChurn([], NOW)).toBeNull();
  });

  it("shows no risk for a customer inside their rhythm", () => {
    const insight = scoreChurn(orders("2026-07-15"), NOW, 30)!;
    expect(insight.risk).toBe(0);
    expect(insight.rationale).toContain("within their normal");
  });

  it("flags dormancy relative to the customer's own cadence", () => {
    // Monthly customer silent for ~4 months → near max dormancy
    const insight = scoreChurn(orders("2026-03-30"), NOW, 30)!;
    expect(insight.risk).toBeGreaterThan(0.8);
    expect(insight.rationale).toContain("Silent for");
  });

  it("does not flag an annual customer for a months-long gap", () => {
    const insight = scoreChurn(orders("2026-01-30"), NOW, null)!;
    expect(insight.risk).toBe(0); // 181 days on a 365-day fallback scale
  });

  it("flags volume decline between windows", () => {
    // 4 orders in the prior 180d window, 1 in the recent one
    const insight = scoreChurn(
      orders(
        "2025-08-10",
        "2025-09-10",
        "2025-10-10",
        "2025-12-10",
        "2026-07-20",
      ),
      NOW,
      30,
    )!;
    expect(insight.priorCount).toBe(4);
    expect(insight.recentCount).toBe(1);
    expect(insight.risk).toBeCloseTo((3 / 4) * 0.95, 2);
    expect(insight.rationale).toContain("dropped from 4 to 1");
  });

  it("needs at least two prior-window orders to call it a decline", () => {
    const insight = scoreChurn(orders("2025-12-01", "2026-07-20"), NOW, 231)!;
    expect(insight.risk).toBe(0);
  });

  it("caps risk below certainty", () => {
    const insight = scoreChurn(orders("2020-01-01"), NOW, 30)!;
    expect(insight.risk).toBe(0.95);
  });

  it("is deterministic for identical inputs", () => {
    const input = orders("2026-01-01", "2026-02-01");
    expect(scoreChurn(input, NOW, 31)).toEqual(scoreChurn(input, NOW, 31));
  });
});
