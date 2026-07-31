/**
 * Cycle time and bottleneck detection from JobStatusEvent — pure, with
 * an injected clock (docs/ai-roadmap.md §2.4).
 *
 * This is only computable because every transition is now recorded
 * structurally; it cannot be derived from the activity feed's English
 * summaries. Stages with too little history report null rather than a
 * median of one.
 */

import { JOB_STATUSES } from "@/lib/validation/jobs";

export type StatusEvent = {
  jobId: string;
  fromStatus: string | null;
  toStatus: string;
  at: Date;
};

export type StageStats = {
  stage: string;
  /** completed visits to this stage */
  samples: number;
  medianHours: number | null;
  p90Hours: number | null;
  /** jobs sitting in this stage right now */
  openNow: number;
};

export type CycleTimeReport = {
  stages: StageStats[];
  /** slowest stage by median, among those with enough samples */
  bottleneck: StageStats | null;
  /** completed jobs measured end to end */
  completedJobs: number;
  medianTotalHours: number | null;
  rationale: string;
};

/** A stage needs this many completed visits before a median is honest. */
export const MIN_SAMPLES = 3;
const HOUR = 3_600_000;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return Math.round(value * 10) / 10;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return Math.round(sorted[index] * 10) / 10;
}

export function analyzeCycleTime(
  events: StatusEvent[],
  now: Date,
): CycleTimeReport {
  // Group by job, ordered in time
  const byJob = new Map<string, StatusEvent[]>();
  for (const event of events) {
    const list = byJob.get(event.jobId) ?? [];
    list.push(event);
    byJob.set(event.jobId, list);
  }
  for (const list of byJob.values()) {
    list.sort((a, b) => a.at.getTime() - b.at.getTime());
  }

  const dwellByStage = new Map<string, number[]>();
  const openByStage = new Map<string, number>();
  const totals: number[] = [];

  for (const list of byJob.values()) {
    for (let i = 0; i < list.length; i++) {
      const entered = list[i];
      const left = list[i + 1];
      if (left) {
        // A completed visit: entered this status, later left it
        const hours = (left.at.getTime() - entered.at.getTime()) / HOUR;
        const bucket = dwellByStage.get(entered.toStatus) ?? [];
        bucket.push(hours);
        dwellByStage.set(entered.toStatus, bucket);
      } else if (entered.toStatus !== "DONE") {
        // Still sitting here — counted as open, not as a dwell sample,
        // because the visit hasn't finished and would bias the median low.
        openByStage.set(
          entered.toStatus,
          (openByStage.get(entered.toStatus) ?? 0) + 1,
        );
      }
    }

    const first = list[0];
    const done = list.find((e) => e.toStatus === "DONE");
    if (first && done) {
      totals.push((done.at.getTime() - first.at.getTime()) / HOUR);
    }
  }

  const stages: StageStats[] = JOB_STATUSES.filter((s) => s !== "DONE").map(
    (stage) => {
      const samples = dwellByStage.get(stage) ?? [];
      return {
        stage,
        samples: samples.length,
        medianHours: samples.length >= MIN_SAMPLES ? median(samples) : null,
        p90Hours:
          samples.length >= MIN_SAMPLES ? percentile(samples, 90) : null,
        openNow: openByStage.get(stage) ?? 0,
      };
    },
  );

  const measured = stages.filter((s) => s.medianHours !== null);
  const bottleneck =
    measured.length > 0
      ? measured.reduce((worst, s) =>
          (s.medianHours ?? 0) > (worst.medianHours ?? 0) ? s : worst,
        )
      : null;

  const medianTotalHours = totals.length >= MIN_SAMPLES ? median(totals) : null;

  const rationale = bottleneck
    ? `${bottleneck.stage} is the slowest stage at a median of ${bottleneck.medianHours} h across ${bottleneck.samples} jobs${
        bottleneck.openNow > 0
          ? `, with ${bottleneck.openNow} sitting there now`
          : ""
      }.`
    : `Not enough completed transitions yet — a stage needs ${MIN_SAMPLES} finished visits before its median means anything.`;

  return {
    stages,
    bottleneck,
    completedJobs: totals.length,
    medianTotalHours,
    rationale,
  };
}

/** On-time delivery from promised vs actual. Null when nothing is comparable. */
export function onTimeRate(
  jobs: Array<{ dueDate: Date | null; deliveredAt: Date | null }>,
): { rate: number; sample: number } | null {
  const comparable = jobs.filter((j) => j.dueDate && j.deliveredAt);
  if (comparable.length === 0) return null;
  const onTime = comparable.filter(
    (j) => j.deliveredAt!.getTime() <= j.dueDate!.getTime(),
  ).length;
  return {
    rate: Math.round((onTime / comparable.length) * 100) / 100,
    sample: comparable.length,
  };
}
