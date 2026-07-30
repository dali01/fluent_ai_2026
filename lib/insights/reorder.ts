/**
 * Reorder-likelihood scoring — deterministic, no AI. Claude only ever
 * explains these numbers (lib/ai/insights.ts); it never produces them.
 *
 * Model: a customer with a regular order cadence becomes "due" as the
 * time since their last order approaches and passes their typical
 * interval. Likelihood ramps linearly from 0 at half the typical
 * interval to ~0.9 at 1.5× it, saturating at 0.95 — never 1, the
 * future is not a database column. Past 2.5× the cadence the customer
 * has LAPSED, not "due": likelihood tapers back to 0 by 5× and the
 * churn signal (lib/insights/churn.ts) owns them instead.
 */

export type OrderEvent = {
  /** completion (or creation) date of a real order */
  at: Date;
  quantity?: number;
  title?: string | null;
};

export type ReorderInsight = {
  /** 0..1 likelihood the customer is due to reorder */
  likelihood: number;
  orderCount: number;
  medianIntervalDays: number;
  daysSinceLast: number;
  /** daysSinceLast / medianIntervalDays — >1 means overdue */
  dueRatio: number;
  /** deterministic one-line rationale, shown in the UI as-is */
  rationale: string;
};

const MS_PER_DAY = 86_400_000;
const MAX_LIKELIHOOD = 0.95;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Returns null when there is no cadence to reason about (fewer than two
 * orders) — absence of history is not a signal in either direction.
 */
export function scoreReorder(
  orders: OrderEvent[],
  now: Date,
): ReorderInsight | null {
  const dated = orders
    .filter((o) => o.at.getTime() <= now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  if (dated.length < 2) return null;

  const intervals: number[] = [];
  for (let i = 1; i < dated.length; i++) {
    intervals.push(
      (dated[i].at.getTime() - dated[i - 1].at.getTime()) / MS_PER_DAY,
    );
  }
  // Same-day duplicate orders carry no cadence information
  const meaningful = intervals.filter((d) => d >= 1);
  if (meaningful.length === 0) return null;

  const medianIntervalDays = median(meaningful);
  const daysSinceLast =
    (now.getTime() - dated[dated.length - 1].at.getTime()) / MS_PER_DAY;
  const dueRatio = daysSinceLast / medianIntervalDays;

  // 0 at ratio 0.5, 0.9 at ratio 1.5, capped; tapers to 0 from 2.5× to 5×
  const ramp = Math.min(MAX_LIKELIHOOD, Math.max(0, (dueRatio - 0.5) * 0.9));
  const lapse =
    dueRatio <= 2.5 ? 1 : Math.max(0, 1 - (dueRatio - 2.5) / 2.5);
  const likelihood = ramp * lapse;

  const last = dated[dated.length - 1];
  const rationale =
    dueRatio >= 1
      ? `${dated.length} orders, one every ~${Math.round(medianIntervalDays)} days; last${last.title ? ` ("${last.title}")` : ""} was ${Math.round(daysSinceLast)} days ago — ${Math.round((dueRatio - 1) * 100)}% past their usual cadence.`
      : `${dated.length} orders, one every ~${Math.round(medianIntervalDays)} days; last was ${Math.round(daysSinceLast)} days ago — next order expected in ~${Math.round(medianIntervalDays - daysSinceLast)} days.`;

  return {
    likelihood: Math.round(likelihood * 100) / 100,
    orderCount: dated.length,
    medianIntervalDays: Math.round(medianIntervalDays),
    daysSinceLast: Math.round(daysSinceLast),
    dueRatio: Math.round(dueRatio * 100) / 100,
    rationale,
  };
}
