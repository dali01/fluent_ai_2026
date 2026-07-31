import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKING_HOURS,
  estimateTurnaround,
  meetsDueDate,
  type PressCapability,
} from "@/lib/production/turnaround";

/** Wednesday 2026-07-29, 09:00 UTC — mid-week, mid-shift. */
const NOW = new Date("2026-07-29T09:00:00Z");

const sm74: PressCapability = {
  id: "p1",
  name: "Heidelberg SM 74",
  sheetsPerHour: 1000,
  makereadyMinutes: 30,
};

describe("estimateTurnaround", () => {
  it("returns null when the press has no run speed — never guesses", () => {
    const estimate = estimateTurnaround({
      now: NOW,
      sheets: 2000,
      press: { ...sm74, sheetsPerHour: null },
      bookings: [],
    });
    expect(estimate).toBeNull();
  });

  it("returns null for an empty run", () => {
    expect(
      estimateTurnaround({ now: NOW, sheets: 0, press: sm74, bookings: [] }),
    ).toBeNull();
  });

  it("adds makeready to run time and finishes the same day", () => {
    // 2000 sheets at 1000/h = 120 min, +30 makeready = 2.5 h → 11:30
    const estimate = estimateTurnaround({
      now: NOW,
      sheets: 2000,
      press: sm74,
      bookings: [],
    })!;
    expect(estimate.runMinutes).toBe(120);
    expect(estimate.makereadyMinutes).toBe(30);
    expect(estimate.totalWorkMinutes).toBe(150);
    expect(estimate.estimatedFinish.toISOString()).toBe(
      "2026-07-29T11:30:00.000Z",
    );
  });

  it("spills across working days rather than running overnight", () => {
    // 16 000 sheets = 16 h + 0.5 h makeready. Wed 09:00–17:00 gives 8 h,
    // Thu gives 8 h (08:00–16:00 covers the rest) → finishes Thursday.
    const estimate = estimateTurnaround({
      now: NOW,
      sheets: 16_000,
      press: sm74,
      bookings: [],
    })!;
    const finish = estimate.estimatedFinish;
    expect(finish.getUTCDate()).toBe(30); // Thursday
    expect(finish.getUTCHours()).toBeLessThanOrEqual(17);
    expect(finish.getUTCHours()).toBeGreaterThanOrEqual(8);
  });

  it("skips the weekend", () => {
    // Friday 15:00, 10 h of work → cannot finish before Monday
    const friday = new Date("2026-07-31T15:00:00Z");
    const estimate = estimateTurnaround({
      now: friday,
      sheets: 10_000,
      press: sm74,
      bookings: [],
    })!;
    // 2026-08-03 is the Monday
    expect(estimate.estimatedFinish.toISOString().slice(0, 10)).toBe(
      "2026-08-03",
    );
  });

  it("waits for the press to be free and says so", () => {
    const estimate = estimateTurnaround({
      now: NOW,
      sheets: 1000,
      press: sm74,
      bookings: [
        {
          startsAt: new Date("2026-07-29T08:00:00Z"),
          endsAt: new Date("2026-07-29T14:00:00Z"),
        },
      ],
    })!;
    expect(estimate.earliestStart.toISOString()).toBe(
      "2026-07-29T14:00:00.000Z",
    );
    expect(estimate.factors.some((f) => f.factor === "queue")).toBe(true);
  });

  it("never promises a slot the booking check would reject", () => {
    // A booking covering the whole of Wednesday pushes work to Thursday
    const estimate = estimateTurnaround({
      now: NOW,
      sheets: 1000,
      press: sm74,
      bookings: [
        {
          startsAt: new Date("2026-07-29T00:00:00Z"),
          endsAt: new Date("2026-07-30T00:00:00Z"),
        },
      ],
    })!;
    expect(estimate.earliestStart.getUTCDate()).toBe(30);
  });

  it("includes post-press time when supplied", () => {
    const estimate = estimateTurnaround({
      now: NOW,
      sheets: 1000,
      press: sm74,
      bookings: [],
      postPressHours: 2,
    })!;
    expect(estimate.postPressMinutes).toBe(120);
    expect(estimate.totalWorkMinutes).toBe(30 + 60 + 120);
  });

  it("treats a missing makeready time as zero, and says so", () => {
    const estimate = estimateTurnaround({
      now: NOW,
      sheets: 1000,
      press: { ...sm74, makereadyMinutes: null },
      bookings: [],
    })!;
    expect(estimate.makereadyMinutes).toBe(0);
    expect(
      estimate.factors.find((f) => f.factor === "makeready")?.detail,
    ).toContain("no makeready time recorded");
  });

  it("respects custom working hours", () => {
    const estimate = estimateTurnaround({
      now: NOW,
      sheets: 1000,
      press: sm74,
      bookings: [],
      hours: { ...DEFAULT_WORKING_HOURS, endHour: 10 },
    })!;
    // Only one hour left today (09:00–10:00) for 1.5 h of work
    expect(estimate.estimatedFinish.getUTCDate()).toBe(30);
  });

  it("is deterministic for identical inputs", () => {
    const input = { now: NOW, sheets: 5000, press: sm74, bookings: [] };
    expect(estimateTurnaround(input)).toEqual(estimateTurnaround(input));
  });
});

describe("meetsDueDate", () => {
  const estimate = estimateTurnaround({
    now: NOW,
    sheets: 2000,
    press: sm74,
    bookings: [],
  })!;

  it("passes when the finish lands before the promise", () => {
    expect(meetsDueDate(estimate, new Date("2026-07-30T00:00:00Z"))).toBe(true);
  });

  it("fails when it does not", () => {
    expect(meetsDueDate(estimate, new Date("2026-07-29T10:00:00Z"))).toBe(
      false,
    );
  });
});
