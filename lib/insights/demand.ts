/**
 * Material demand forecasting — pure, injected clock
 * (docs/ai-roadmap.md Tier 3).
 *
 * Deliberately modest. This projects consumption from the shop's own
 * ledger and says how long stock lasts; it does NOT decide when to
 * order, because no supplier lead time exists in the schema. Every
 * output carries that caveat rather than implying a purchase date the
 * data cannot support.
 */

export type ConsumptionEvent = { at: Date; quantity: number };

export type DemandForecast = {
  itemName: string;
  /** completed months of history the projection rests on */
  monthsObserved: number;
  monthlyAverage: number;
  /** most recent 3 months vs the 3 before — >1 means rising */
  trendRatio: number | null;
  /** multiplier for the month being projected, 1 = no seasonal effect */
  seasonalIndex: number | null;
  projectedNext30Days: number;
  quantityOnHand: number;
  /** null when nothing is being consumed */
  daysOfCover: number | null;
  belowReorderPoint: boolean;
  rationale: string;
  caveats: string[];
};

/** Below this, a "seasonal pattern" is noise. */
export const MIN_MONTHS = 6;

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function forecastDemand(input: {
  itemName: string;
  consumption: ConsumptionEvent[];
  quantityOnHand: number;
  reorderThreshold: number;
  now: Date;
}): DemandForecast | null {
  const { consumption, now } = input;
  const used = consumption.filter(
    (c) => c.quantity > 0 && c.at.getTime() <= now.getTime(),
  );
  if (used.length === 0) return null;

  // Bucket by calendar month, ignoring the current partial one so a
  // half-finished month can't look like a collapse in demand.
  const currentMonth = monthKey(now);
  const buckets = new Map<string, number>();
  for (const event of used) {
    const key = monthKey(event.at);
    if (key === currentMonth) continue;
    buckets.set(key, (buckets.get(key) ?? 0) + event.quantity);
  }
  const months = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (months.length === 0) return null;

  const totals = months.map(([, total]) => total);
  const monthlyAverage = Math.round(sum(totals) / totals.length);

  // Trend: last three complete months against the three before them
  let trendRatio: number | null = null;
  if (months.length >= 6) {
    const recent = sum(totals.slice(-3));
    const prior = sum(totals.slice(-6, -3));
    trendRatio = prior > 0 ? Math.round((recent / prior) * 100) / 100 : null;
  }

  // Seasonality: how this calendar month has historically compared with
  // the average. Needs a full year before it means anything.
  let seasonalIndex: number | null = null;
  const caveats: string[] = [];
  const targetMonth = String(now.getUTCMonth() + 1).padStart(2, "0");
  if (months.length >= 12) {
    const sameMonth = months
      .filter(([key]) => key.endsWith(`-${targetMonth}`))
      .map(([, total]) => total);
    if (sameMonth.length > 0 && monthlyAverage > 0) {
      seasonalIndex =
        Math.round((sum(sameMonth) / sameMonth.length / monthlyAverage) * 100) /
        100;
    }
  } else {
    caveats.push(
      `Under 12 months of history, so no seasonal adjustment — this is a flat average of ${months.length} month${months.length === 1 ? "" : "s"}.`,
    );
  }

  if (months.length < MIN_MONTHS) {
    caveats.push(
      `Only ${months.length} complete month${months.length === 1 ? "" : "s"} observed; treat the projection as indicative.`,
    );
  }

  const projected = Math.round(
    monthlyAverage * (seasonalIndex ?? 1) * (trendRatio ?? 1),
  );
  const dailyRate = projected / 30;
  const daysOfCover =
    dailyRate > 0
      ? Math.round((input.quantityOnHand / dailyRate) * 10) / 10
      : null;

  caveats.push(
    "Excludes supplier lead time, which the system does not know — check it before ordering.",
  );

  const coverText =
    daysOfCover === null
      ? "nothing is being consumed"
      : daysOfCover < 30
        ? `stock covers about ${daysOfCover} days`
        : `stock covers about ${Math.round(daysOfCover / 30)} months`;

  return {
    itemName: input.itemName,
    monthsObserved: months.length,
    monthlyAverage,
    trendRatio,
    seasonalIndex,
    projectedNext30Days: projected,
    quantityOnHand: input.quantityOnHand,
    daysOfCover,
    belowReorderPoint: input.quantityOnHand <= input.reorderThreshold,
    rationale: `${input.itemName}: ~${monthlyAverage.toLocaleString("sv-SE")}/month over ${months.length} months${
      trendRatio !== null && Math.abs(trendRatio - 1) >= 0.15
        ? `, ${trendRatio > 1 ? "rising" : "falling"} (${trendRatio}× the prior quarter)`
        : ""
    }${
      seasonalIndex !== null && Math.abs(seasonalIndex - 1) >= 0.15
        ? `, and this month usually runs ${seasonalIndex}× average`
        : ""
    } — projecting ${projected.toLocaleString("sv-SE")} in the next 30 days, ${coverText}.`,
    caveats,
  };
}

/** Sort helper: the things about to run out come first. */
export function byUrgency(a: DemandForecast, b: DemandForecast): number {
  const aCover = a.daysOfCover ?? Number.POSITIVE_INFINITY;
  const bCover = b.daysOfCover ?? Number.POSITIVE_INFINITY;
  return aCover - bCover;
}
