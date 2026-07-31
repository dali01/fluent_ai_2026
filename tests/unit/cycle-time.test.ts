import { describe, expect, it } from "vitest";
import {
  analyzeCycleTime,
  MIN_SAMPLES,
  onTimeRate,
  type StatusEvent,
} from "@/lib/production/cycle-time";

const NOW = new Date("2026-07-31T12:00:00Z");
const at = (iso: string) => new Date(iso);

/** Four jobs that each sat a long time in PREPRESS. */
function history(): StatusEvent[] {
  const events: StatusEvent[] = [];
  for (let i = 1; i <= 4; i++) {
    const day = 10 + i;
    events.push(
      {
        jobId: `j${i}`,
        fromStatus: null,
        toStatus: "DESIGN",
        at: at(`2026-07-${day}T08:00:00Z`),
      },
      {
        jobId: `j${i}`,
        fromStatus: "DESIGN",
        toStatus: "PREPRESS",
        at: at(`2026-07-${day}T10:00:00Z`),
      },
      {
        jobId: `j${i}`,
        fromStatus: "PREPRESS",
        toStatus: "PRINTING",
        at: at(`2026-07-${day + 1}T10:00:00Z`), // 24 h in prepress
      },
      {
        jobId: `j${i}`,
        fromStatus: "PRINTING",
        toStatus: "DONE",
        at: at(`2026-07-${day + 1}T13:00:00Z`), // 3 h printing
      },
    );
  }
  return events;
}

describe("analyzeCycleTime", () => {
  const report = analyzeCycleTime(history(), NOW);

  it("computes a median dwell per stage", () => {
    const prepress = report.stages.find((s) => s.stage === "PREPRESS")!;
    expect(prepress.samples).toBe(4);
    expect(prepress.medianHours).toBe(24);
    const printing = report.stages.find((s) => s.stage === "PRINTING")!;
    expect(printing.medianHours).toBe(3);
  });

  it("names the slowest stage as the bottleneck", () => {
    expect(report.bottleneck?.stage).toBe("PREPRESS");
    expect(report.rationale).toContain("PREPRESS");
    expect(report.rationale).toContain("24");
  });

  it("measures end-to-end time for completed jobs", () => {
    expect(report.completedJobs).toBe(4);
    expect(report.medianTotalHours).toBe(29); // 08:00 → next day 13:00
  });

  it("refuses a median below the sample floor", () => {
    const thin = analyzeCycleTime(history().slice(0, 8), NOW); // 2 jobs
    const prepress = thin.stages.find((s) => s.stage === "PREPRESS")!;
    expect(prepress.samples).toBeLessThan(MIN_SAMPLES);
    expect(prepress.medianHours).toBeNull();
    expect(thin.bottleneck).toBeNull();
    expect(thin.rationale).toContain("Not enough completed transitions");
  });

  it("counts jobs still sitting in a stage without biasing the median", () => {
    const events = [
      ...history(),
      {
        jobId: "j99",
        fromStatus: null,
        toStatus: "PREPRESS",
        at: at("2026-07-30T08:00:00Z"),
      },
    ];
    const out = analyzeCycleTime(events, NOW);
    const prepress = out.stages.find((s) => s.stage === "PREPRESS")!;
    expect(prepress.openNow).toBe(1);
    expect(prepress.samples).toBe(4); // unchanged — the visit isn't over
    expect(prepress.medianHours).toBe(24);
    // Entered 2026-07-30 08:00, "now" is 2026-07-31 12:00 → 28 h stuck.
    // A job stuck for days is exactly what a median hides.
    expect(prepress.oldestOpenHours).toBe(28);
  });

  it("reports no open age for a stage nothing is sitting in", () => {
    const prepress = report.stages.find((s) => s.stage === "PREPRESS")!;
    expect(prepress.oldestOpenHours).toBeNull();
  });

  it("reports p90 alongside the median", () => {
    const prepress = report.stages.find((s) => s.stage === "PREPRESS")!;
    expect(prepress.p90Hours).toBeGreaterThanOrEqual(prepress.medianHours!);
  });

  it("handles no history without throwing", () => {
    const empty = analyzeCycleTime([], NOW);
    expect(empty.bottleneck).toBeNull();
    expect(empty.completedJobs).toBe(0);
    expect(empty.medianTotalHours).toBeNull();
  });

  it("never reports DONE as a stage — nothing dwells there", () => {
    expect(report.stages.some((s) => s.stage === "DONE")).toBe(false);
  });
});

describe("onTimeRate", () => {
  it("is null when nothing is comparable", () => {
    expect(onTimeRate([])).toBeNull();
    expect(onTimeRate([{ dueDate: new Date(), deliveredAt: null }])).toBeNull();
  });

  it("excludes jobs with no promised date rather than counting them as wins", () => {
    const out = onTimeRate([
      {
        dueDate: at("2026-07-10T00:00:00Z"),
        deliveredAt: at("2026-07-09T00:00:00Z"),
      },
      { dueDate: null, deliveredAt: at("2026-07-09T00:00:00Z") },
    ])!;
    expect(out.sample).toBe(1);
    expect(out.rate).toBe(1);
  });

  it("counts a late delivery as missed", () => {
    const out = onTimeRate([
      {
        dueDate: at("2026-07-10T00:00:00Z"),
        deliveredAt: at("2026-07-09T00:00:00Z"),
      },
      {
        dueDate: at("2026-07-10T00:00:00Z"),
        deliveredAt: at("2026-07-12T00:00:00Z"),
      },
    ])!;
    expect(out.rate).toBe(0.5);
  });

  it("treats delivery exactly on the due date as on time", () => {
    const due = at("2026-07-10T00:00:00Z");
    expect(onTimeRate([{ dueDate: due, deliveredAt: due }])!.rate).toBe(1);
  });
});
