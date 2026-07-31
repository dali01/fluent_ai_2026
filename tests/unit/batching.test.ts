import { describe, expect, it } from "vitest";
import {
  piecesPerSheet,
  suggestBatches,
  type BatchableJob,
  type BatchPress,
} from "@/lib/production/batching";

const NOW = new Date("2026-07-31T09:00:00Z");

const sm74: BatchPress = {
  name: "Heidelberg SM 74",
  sheetWidthMm: 740,
  sheetHeightMm: 1040,
  makereadySheets: 150,
  makereadyMinutes: 45,
  hourlyRateCents: 95_000,
};

let counter = 0;
function job(overrides: Partial<BatchableJob> = {}): BatchableJob {
  counter += 1;
  return {
    id: `j${counter}`,
    jobNumber: 2000 + counter,
    title: `Job ${counter}`,
    quantity: 1000,
    stock: "Silk 170gsm",
    colorMode: "CMYK",
    finish: "matte laminate",
    widthMm: 210,
    heightMm: 297,
    dueDate: new Date("2026-08-05T00:00:00Z"),
    status: "PREPRESS",
    ...overrides,
  };
}

describe("piecesPerSheet", () => {
  it("counts A4 up on a B1-ish sheet, best orientation", () => {
    // 740×1040 with 210×297: portrait 3×3=9, landscape 2×4=8 → 9
    expect(piecesPerSheet(740, 1040, 210, 297)).toBe(9);
  });

  it("tries the rotated orientation when it fits better", () => {
    expect(piecesPerSheet(1000, 200, 200, 100)).toBe(10); // rotated wins
  });

  it("returns zero for a piece larger than the sheet", () => {
    expect(piecesPerSheet(300, 400, 500, 600)).toBe(0);
  });

  it("rejects nonsense dimensions instead of dividing by zero", () => {
    expect(piecesPerSheet(740, 1040, 0, 297)).toBe(0);
    expect(piecesPerSheet(740, 1040, -5, 297)).toBe(0);
  });
});

describe("suggestBatches", () => {
  it("says nothing when the press has no makeready figures", () => {
    const out = suggestBatches({
      jobs: [job(), job()],
      press: { ...sm74, makereadySheets: null, makereadyMinutes: null },
      now: NOW,
    });
    expect(out).toEqual([]);
  });

  it("needs at least two compatible jobs", () => {
    expect(suggestBatches({ jobs: [job()], press: sm74, now: NOW })).toEqual(
      [],
    );
  });

  it("groups jobs sharing stock, colour and finish", () => {
    const out = suggestBatches({
      jobs: [job(), job(), job({ stock: "Uncoated 120gsm" })],
      press: sm74,
      now: NOW,
    });
    expect(out).toHaveLength(1);
    expect(out[0].jobs).toHaveLength(2);
    expect(out[0].stock).toBe("Silk 170gsm");
  });

  it("does not group across different colour modes or finishes", () => {
    const out = suggestBatches({
      jobs: [job(), job({ colorMode: "PANTONE" }), job({ finish: "gloss" })],
      press: sm74,
      now: NOW,
    });
    expect(out).toEqual([]);
  });

  it("claims only the makeready that consolidation avoids", () => {
    const out = suggestBatches({
      jobs: [job(), job(), job()],
      press: sm74,
      now: NOW,
      costPerSheet: 0.42,
    })[0];
    expect(out.makereadysAvoided).toBe(2); // 3 jobs → 1 setup
    expect(out.sheetsSaved).toBe(300);
    expect(out.minutesSaved).toBe(90);
    // 300 sheets × 0.42 = 126.00, plus 1.5 h × 950.00 = 1425.00
    expect(out.savingCents).toBe(Math.round(300 * 0.42 * 100 + 1.5 * 95_000));
  });

  it("omits money rather than guessing when nothing is priced", () => {
    const out = suggestBatches({
      jobs: [job(), job()],
      press: { ...sm74, hourlyRateCents: null },
      now: NOW,
    })[0];
    expect(out.savingCents).toBeNull();
  });

  it("always states that pieces are not nested on a shared sheet", () => {
    const out = suggestBatches({
      jobs: [job(), job()],
      press: sm74,
      now: NOW,
    })[0];
    expect(out.caveats[0]).toContain("not nested");
  });

  it("warns when due dates are far apart", () => {
    const out = suggestBatches({
      jobs: [
        job({ dueDate: new Date("2026-08-01T00:00:00Z") }),
        job({ dueDate: new Date("2026-09-30T00:00:00Z") }),
      ],
      press: sm74,
      now: NOW,
    })[0];
    expect(out.dueDateSpreadDays).toBe(60);
    expect(out.caveats.some((c) => c.includes("60 days"))).toBe(true);
  });

  it("flags jobs whose artwork is not approved yet", () => {
    const out = suggestBatches({
      jobs: [job({ status: "PROOFING" }), job({ status: "PREPRESS" })],
      press: sm74,
      now: NOW,
    })[0];
    expect(out.jobs.filter((j) => j.notYetReady)).toHaveLength(1);
    expect(out.caveats.some((c) => c.includes("artwork to approve"))).toBe(
      true,
    );
  });

  it("runs the batch by the earliest promise in it", () => {
    const early = new Date("2026-08-02T00:00:00Z");
    const out = suggestBatches({
      jobs: [
        job({ dueDate: new Date("2026-08-20T00:00:00Z") }),
        job({ dueDate: early }),
      ],
      press: sm74,
      now: NOW,
    })[0];
    expect(out.runBy?.toISOString()).toBe(early.toISOString());
  });

  it("warns when a job in the batch is already overdue", () => {
    const out = suggestBatches({
      jobs: [job({ dueDate: new Date("2026-07-01T00:00:00Z") }), job()],
      press: sm74,
      now: NOW,
    })[0];
    expect(out.caveats.some((c) => c.includes("past its due date"))).toBe(true);
  });

  it("skips jobs with no stock — they cannot be matched safely", () => {
    expect(
      suggestBatches({
        jobs: [job({ stock: null }), job({ stock: "" })],
        press: sm74,
        now: NOW,
      }),
    ).toEqual([]);
  });

  it("reports pieces per sheet as context, and null when unknown", () => {
    const out = suggestBatches({
      jobs: [job(), job({ widthMm: null })],
      press: sm74,
      now: NOW,
    })[0];
    expect(out.jobs[0].piecesPerSheet).toBe(9);
    expect(out.jobs[1].piecesPerSheet).toBeNull();
    expect(out.caveats.some((c) => c.includes("no trim size"))).toBe(true);
  });

  it("orders suggestions by the size of the saving", () => {
    const out = suggestBatches({
      jobs: [
        job({ stock: "A" }),
        job({ stock: "A" }),
        job({ stock: "B" }),
        job({ stock: "B" }),
        job({ stock: "B" }),
      ],
      press: sm74,
      now: NOW,
      costPerSheet: 0.5,
    });
    expect(out[0].stock).toBe("B"); // 2 makereadys avoided beats 1
  });
});
