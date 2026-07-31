/**
 * Waste and spoilage — pure (docs/ai-roadmap.md §2.3).
 *
 * Two functions, and the difference between them is the whole point:
 *  - estimateWaste() computes from CONFIGURED press figures. It is a
 *    model, and everything that renders it must say "estimated".
 *  - measuredSpoilage() computes from RECORDED actuals. It only returns
 *    a number once enough jobs have real figures, because until someone
 *    records what was actually used, planned equals actual by
 *    construction and the variance is a meaningless zero.
 */

export type WastePress = {
  name: string;
  makereadySheets: number | null;
  /** run spoilage as a percent of the run, e.g. 2.5 */
  spoilagePercent: number | null;
};

export type WasteFactor = { factor: string; sheets: number; detail: string };

export type WasteEstimate = {
  source: "estimated";
  makereadySheets: number;
  runSpoilageSheets: number;
  totalWasteSheets: number;
  /** sheets to buy: the run plus its waste */
  sheetsRequired: number;
  wastePercent: number;
  costCents: number | null;
  factors: WasteFactor[];
  rationale: string;
};

export function estimateWaste(input: {
  press: WastePress;
  runSheets: number;
  /** unit cost in currency units (not cents), when known */
  costPerSheet?: number | null;
}): WasteEstimate | null {
  const { press, runSheets } = input;
  if (runSheets <= 0) return null;
  // Fail closed, like turnaround: no configured figures, no estimate.
  if (press.makereadySheets === null && press.spoilagePercent === null) {
    return null;
  }

  const makeready = press.makereadySheets ?? 0;
  const spoilagePercent = press.spoilagePercent ?? 0;
  const runSpoilage = Math.ceil((runSheets * spoilagePercent) / 100);
  const total = makeready + runSpoilage;
  const required = runSheets + total;

  const factors: WasteFactor[] = [
    {
      factor: "makeready",
      sheets: makeready,
      detail: press.makereadySheets
        ? `${makeready} sheets to bring ${press.name} up to colour`
        : `no makeready sheet count recorded for ${press.name}`,
    },
    {
      factor: "run spoilage",
      sheets: runSpoilage,
      detail: press.spoilagePercent
        ? `${spoilagePercent}% of ${runSheets.toLocaleString("sv-SE")} sheets`
        : `no spoilage rate recorded for ${press.name}`,
    },
  ];

  return {
    source: "estimated",
    makereadySheets: makeready,
    runSpoilageSheets: runSpoilage,
    totalWasteSheets: total,
    sheetsRequired: required,
    wastePercent: Math.round((total / runSheets) * 1000) / 10,
    costCents:
      input.costPerSheet != null
        ? Math.round(total * input.costPerSheet * 100)
        : null,
    factors,
    rationale: `Order ${required.toLocaleString("sv-SE")} sheets for a run of ${runSheets.toLocaleString("sv-SE")} — ${total.toLocaleString("sv-SE")} allowed for waste. Estimated from ${press.name}'s configured figures, not measured.`,
  };
}

export type SpoilageObservation = {
  /** what the job planned to consume */
  planned: number;
  /** what was actually consumed, when recorded */
  actual: number | null;
  /** sheets explicitly logged as spoiled */
  spoiled: number | null;
};

export type MeasuredSpoilage = {
  source: "measured";
  samples: number;
  medianSpoilagePercent: number;
  /** how the measurement compares with what the press is configured for */
  configuredPercent: number | null;
  drift: number | null;
  rationale: string;
};

/** A configured rate is only worth challenging on this much evidence. */
export const MIN_SPOILAGE_SAMPLES = 5;

export function measuredSpoilage(
  observations: SpoilageObservation[],
  configuredPercent: number | null,
): MeasuredSpoilage | null {
  // Only jobs where someone actually recorded a figure count. Everything
  // else has actual === planned by construction and would drag the
  // measurement to a flattering zero.
  const usable = observations.filter(
    (o) => o.planned > 0 && (o.actual !== null || o.spoiled !== null),
  );
  if (usable.length < MIN_SPOILAGE_SAMPLES) return null;

  const rates = usable.map((o) => {
    const wasted =
      o.spoiled ?? Math.max(0, (o.actual ?? o.planned) - o.planned);
    return (wasted / o.planned) * 100;
  });
  const sorted = [...rates].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const rounded = Math.round(median * 10) / 10;
  const drift =
    configuredPercent !== null
      ? Math.round((rounded - configuredPercent) * 10) / 10
      : null;

  return {
    source: "measured",
    samples: usable.length,
    medianSpoilagePercent: rounded,
    configuredPercent,
    drift,
    rationale:
      drift === null
        ? `Measured ${rounded}% spoilage across ${usable.length} recorded jobs.`
        : Math.abs(drift) < 0.5
          ? `Measured ${rounded}% spoilage across ${usable.length} jobs — the configured ${configuredPercent}% is about right.`
          : `Measured ${rounded}% spoilage across ${usable.length} jobs, ${Math.abs(drift)} points ${drift > 0 ? "above" : "below"} the configured ${configuredPercent}%.`,
  };
}
