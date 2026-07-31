/**
 * Churn-risk scoring — deterministic, no AI (Claude explains, never
 * decides; lib/ai/insights.ts).
 *
 * Two independent signals, combined by max():
 *  - dormancy: time since the last order relative to the customer's own
 *    cadence (a monthly customer silent for 6 months is at risk; an
 *    annual one isn't)
 *  - decline: order volume in the recent window vs the one before it
 */

import type { OrderEvent } from "./reorder";

export type ChurnInsight = {
  /** 0..1 churn/dormancy risk */
  risk: number;
  daysSinceLast: number;
  recentCount: number;
  priorCount: number;
  /** deterministic one-line rationale, shown in the UI as-is */
  rationale: string;
};

const MS_PER_DAY = 86_400_000;
const WINDOW_DAYS = 180;
const MAX_RISK = 0.95;

/**
 * `typicalIntervalDays` comes from scoreReorder when the customer has a
 * cadence; without one, dormancy falls back to an absolute 365-day scale.
 * Returns null for companies with no orders at all — a prospect that
 * never bought can't churn.
 */
export function scoreChurn(
  orders: OrderEvent[],
  now: Date,
  typicalIntervalDays?: number | null,
): ChurnInsight | null {
  const dated = orders
    .filter((o) => o.at.getTime() <= now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  if (dated.length === 0) return null;

  const daysSinceLast =
    (now.getTime() - dated[dated.length - 1].at.getTime()) / MS_PER_DAY;

  // Dormancy: 0 risk at 1× the expected gap, MAX at 4×
  const scale =
    typicalIntervalDays && typicalIntervalDays > 0 ? typicalIntervalDays : 365;
  const dormancy = Math.min(
    MAX_RISK,
    Math.max(0, ((daysSinceLast / scale - 1) / 3) * MAX_RISK),
  );

  // Decline: recent 180 days vs the 180 before that
  const recentStart = now.getTime() - WINDOW_DAYS * MS_PER_DAY;
  const priorStart = now.getTime() - 2 * WINDOW_DAYS * MS_PER_DAY;
  const recentCount = dated.filter((o) => o.at.getTime() >= recentStart).length;
  const priorCount = dated.filter(
    (o) => o.at.getTime() >= priorStart && o.at.getTime() < recentStart,
  ).length;
  const decline =
    priorCount >= 2 && recentCount < priorCount
      ? Math.min(MAX_RISK, ((priorCount - recentCount) / priorCount) * MAX_RISK)
      : 0;

  const risk = Math.max(dormancy, decline);

  const rationale =
    dormancy >= decline
      ? daysSinceLast <= scale
        ? `Last order ${Math.round(daysSinceLast)} days ago — within their normal ~${Math.round(scale)}-day rhythm.`
        : `Silent for ${Math.round(daysSinceLast)} days against a ~${Math.round(scale)}-day rhythm (${(daysSinceLast / scale).toFixed(1)}× the expected gap).`
      : `Orders dropped from ${priorCount} to ${recentCount} across the last two ${WINDOW_DAYS}-day windows.`;

  return {
    risk: Math.round(risk * 100) / 100,
    daysSinceLast: Math.round(daysSinceLast),
    recentCount,
    priorCount,
    rationale,
  };
}
