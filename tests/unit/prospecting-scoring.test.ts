import { describe, expect, it } from "vitest";
import {
  recencyDecay,
  scoreProspect,
  SOURCE_WEIGHTS,
  type ScoreInput,
} from "@/lib/prospecting/scoring";

const NOW = new Date("2026-07-30T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

const base: ScoreInput = {
  source: "PERMIT",
  triggeredAt: daysAgo(0),
  now: NOW,
  categoryFit: 1,
  repeatSignal: 0,
};

describe("scoreProspect", () => {
  it("is deterministic", () => {
    const a = scoreProspect(base);
    const b = scoreProspect(base);
    expect(a).toEqual(b);
  });

  it("stays within 0–100 and factors sum to score", () => {
    const r = scoreProspect({ ...base, repeatSignal: 1, proximity: 1 });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.factors.reduce((s, f) => s + f.points, 0)).toBe(r.score);
  });

  it("recency is monotonically decreasing with age", () => {
    const fresh = scoreProspect({ ...base, triggeredAt: daysAgo(1) }).score;
    const month = scoreProspect({ ...base, triggeredAt: daysAgo(30) }).score;
    const year = scoreProspect({ ...base, triggeredAt: daysAgo(365) }).score;
    expect(fresh).toBeGreaterThan(month);
    expect(month).toBeGreaterThan(year);
  });

  it("half-life halves the recency contribution", () => {
    expect(recencyDecay(30, 30)).toBeCloseTo(0.5, 5);
    expect(recencyDecay(60, 30)).toBeCloseTo(0.25, 5);
  });

  it("per-trigger weights actually differ", () => {
    const permit = scoreProspect({
      ...base,
      source: "PERMIT",
      triggeredAt: daysAgo(30),
    });
    const places = scoreProspect({
      ...base,
      source: "PLACES",
      triggeredAt: daysAgo(30),
    });
    expect(permit.score).not.toBe(places.score);
    expect(SOURCE_WEIGHTS.PERMIT.halfLifeDays).not.toBe(
      SOURCE_WEIGHTS.PLACES.halfLifeDays,
    );
  });

  it("existing customer forces score 0 via an explicit factor", () => {
    const r = scoreProspect({ ...base, existingCustomer: true });
    expect(r.score).toBe(0);
    expect(r.factors[0].factor).toBe("existing-customer");
    expect(r.rationale).toContain("upsell");
  });

  it("FDA proximity is skipped with a reason (nationwide)", () => {
    const r = scoreProspect({ ...base, source: "FDA", proximity: 1 });
    const prox = r.factors.find((f) => f.factor === "proximity")!;
    expect(prox.points).toBe(0);
    expect(prox.detail).toContain("nationwide");
  });

  it("missing trigger date contributes zero recency, not NaN", () => {
    const r = scoreProspect({ ...base, triggeredAt: undefined });
    const rec = r.factors.find((f) => f.factor === "recency")!;
    expect(rec.points).toBe(0);
    expect(Number.isFinite(r.score)).toBe(true);
  });

  it("config overrides apply", () => {
    const r = scoreProspect({
      ...base,
      weights: { categoryFit: 0 },
    });
    const fit = r.factors.find((f) => f.factor === "category-fit")!;
    expect(fit.points).toBe(0);
  });
});
