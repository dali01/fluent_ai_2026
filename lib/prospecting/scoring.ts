/**
 * Deterministic prospect scoring — Claude explains, never decides
 * (DECISIONS.md Phase 3). Style of lib/pricing/engine.ts: exported
 * weight tables, per-factor contributions, assembled rationale.
 * `now` is injected — never Date.now() inside. docs/prospecting.md §6.
 */

export type ProspectSourceKind = "PLACES" | "PERMIT" | "FDA" | "MANUAL";

export type ScoreWeights = {
  recency: number;
  categoryFit: number;
  proximity: number;
  repeatSignal: number;
  halfLifeDays: number;
};

export const SOURCE_WEIGHTS: Record<ProspectSourceKind, ScoreWeights> = {
  // New business / licence: short-fuse — they need signage and cards NOW
  PERMIT: {
    recency: 0.45,
    categoryFit: 0.35,
    proximity: 0.15,
    repeatSignal: 0.05,
    halfLifeDays: 30,
  },
  // FDA approval: longer procurement runway, product fit dominates
  FDA: {
    recency: 0.35,
    categoryFit: 0.45,
    proximity: 0,
    repeatSignal: 0.2,
    halfLifeDays: 45,
  },
  // Places discovery: standing businesses, fit matters most
  PLACES: {
    recency: 0.15,
    categoryFit: 0.55,
    proximity: 0.2,
    repeatSignal: 0.1,
    halfLifeDays: 120,
  },
  MANUAL: {
    recency: 0.25,
    categoryFit: 0.5,
    proximity: 0.15,
    repeatSignal: 0.1,
    halfLifeDays: 90,
  },
};

export type ScoreInput = {
  source: ProspectSourceKind;
  /** when the trigger event happened; undefined → recency contributes 0 */
  triggeredAt?: Date;
  now: Date;
  /** 0..1 from the relevance/category assessment */
  categoryFit: number;
  /** 0..1; undefined when no geo data (factor skipped with a reason) */
  proximity?: number;
  /** 0..1 — e.g. ORIG vs SUPPL submissions, repeat permits */
  repeatSignal: number;
  /** existing customer forces score 0 via an explicit factor */
  existingCustomer?: boolean;
  weights?: Partial<ScoreWeights>;
};

export type ScoreFactor = { factor: string; points: number; detail: string };

export type ScoreResult = {
  score: number; // 0–100 Int
  factors: ScoreFactor[]; // sums to score
  rationale: string; // assembled from factors, no model call
};

const round = (n: number) => Math.round(n);

export function recencyDecay(ageDays: number, halfLifeDays: number): number {
  if (ageDays <= 0) return 1;
  return Math.exp((-Math.LN2 * ageDays) / halfLifeDays);
}

export function scoreProspect(input: ScoreInput): ScoreResult {
  const weights: ScoreWeights = {
    ...SOURCE_WEIGHTS[input.source],
    ...input.weights,
  };
  const factors: ScoreFactor[] = [];

  if (input.existingCustomer) {
    factors.push({
      factor: "existing-customer",
      points: 0,
      detail: "matches an existing customer — upsell signal, not a cold lead",
    });
    return {
      score: 0,
      factors,
      rationale: "Existing customer — routed as upsell signal, score 0.",
    };
  }

  // Recency
  if (input.triggeredAt) {
    const ageDays =
      (input.now.getTime() - input.triggeredAt.getTime()) / 86_400_000;
    const decay = recencyDecay(ageDays, weights.halfLifeDays);
    const points = round(weights.recency * 100 * decay);
    factors.push({
      factor: "recency",
      points,
      detail: `${Math.max(0, Math.round(ageDays))}d old, half-life ${weights.halfLifeDays}d`,
    });
  } else {
    factors.push({ factor: "recency", points: 0, detail: "no trigger date" });
  }

  // Category / product fit
  const fit = Math.max(0, Math.min(1, input.categoryFit));
  factors.push({
    factor: "category-fit",
    points: round(weights.categoryFit * 100 * fit),
    detail: `fit ${Math.round(fit * 100)}%`,
  });

  // Proximity — skipped with a reason when unavailable or weight-zero
  if (weights.proximity === 0) {
    factors.push({
      factor: "proximity",
      points: 0,
      detail: "not applicable for this source (nationwide)",
    });
  } else if (input.proximity == null) {
    factors.push({
      factor: "proximity",
      points: 0,
      detail: "no geo data (geocoding is future work)",
    });
  } else {
    const p = Math.max(0, Math.min(1, input.proximity));
    factors.push({
      factor: "proximity",
      points: round(weights.proximity * 100 * p),
      detail: `${Math.round(p * 100)}% of max proximity`,
    });
  }

  // Repeat signal
  const repeat = Math.max(0, Math.min(1, input.repeatSignal));
  factors.push({
    factor: "repeat-signal",
    points: round(weights.repeatSignal * 100 * repeat),
    detail: `signal strength ${Math.round(repeat * 100)}%`,
  });

  const score = Math.max(
    0,
    Math.min(
      100,
      factors.reduce((s, f) => s + f.points, 0),
    ),
  );
  const rationale = factors
    .filter((f) => f.points > 0 || f.factor === "recency")
    .map((f) => `${f.factor}: +${f.points} (${f.detail})`)
    .join("; ");

  return { score, factors, rationale };
}
