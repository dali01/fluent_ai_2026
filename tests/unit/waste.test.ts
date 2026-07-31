import { describe, expect, it } from "vitest";
import {
  estimateWaste,
  measuredSpoilage,
  MIN_SPOILAGE_SAMPLES,
  type SpoilageObservation,
  type WastePress,
} from "@/lib/production/waste";

const sm74: WastePress = {
  name: "Heidelberg SM 74",
  makereadySheets: 150,
  spoilagePercent: 2,
};

describe("estimateWaste", () => {
  it("returns null when the press has no configured figures", () => {
    expect(
      estimateWaste({
        press: {
          name: "Unknown",
          makereadySheets: null,
          spoilagePercent: null,
        },
        runSheets: 10_000,
      }),
    ).toBeNull();
  });

  it("returns null for an empty run", () => {
    expect(estimateWaste({ press: sm74, runSheets: 0 })).toBeNull();
  });

  it("adds makeready to run spoilage", () => {
    const out = estimateWaste({ press: sm74, runSheets: 10_000 })!;
    expect(out.makereadySheets).toBe(150);
    expect(out.runSpoilageSheets).toBe(200); // 2% of 10 000
    expect(out.totalWasteSheets).toBe(350);
    expect(out.sheetsRequired).toBe(10_350);
    expect(out.wastePercent).toBe(3.5);
  });

  it("always labels itself an estimate, never a measurement", () => {
    const out = estimateWaste({ press: sm74, runSheets: 5000 })!;
    expect(out.source).toBe("estimated");
    expect(out.rationale).toContain("not measured");
  });

  it("works with only one of the two figures configured", () => {
    const noSpoilage = estimateWaste({
      press: { ...sm74, spoilagePercent: null },
      runSheets: 10_000,
    })!;
    expect(noSpoilage.runSpoilageSheets).toBe(0);
    expect(
      noSpoilage.factors.find((f) => f.factor === "run spoilage")?.detail,
    ).toContain("no spoilage rate recorded");

    const noMakeready = estimateWaste({
      press: { ...sm74, makereadySheets: null },
      runSheets: 10_000,
    })!;
    expect(noMakeready.makereadySheets).toBe(0);
  });

  it("costs the waste when a sheet price is known", () => {
    const out = estimateWaste({
      press: sm74,
      runSheets: 10_000,
      costPerSheet: 0.42,
    })!;
    expect(out.costCents).toBe(Math.round(350 * 0.42 * 100));
  });

  it("omits cost rather than guessing when no price is known", () => {
    expect(
      estimateWaste({ press: sm74, runSheets: 1000 })!.costCents,
    ).toBeNull();
  });

  it("rounds spoilage up — you cannot buy a fraction of a sheet", () => {
    const out = estimateWaste({
      press: { ...sm74, spoilagePercent: 2.5 },
      runSheets: 101,
    })!;
    expect(out.runSpoilageSheets).toBe(3); // 2.525 → 3
  });
});

describe("measuredSpoilage", () => {
  const recorded = (n: number, rate: number): SpoilageObservation[] =>
    Array.from({ length: n }, () => ({
      planned: 1000,
      actual: null,
      spoiled: rate * 10, // rate% of 1000
    }));

  it("refuses to measure until enough jobs have recorded actuals", () => {
    expect(
      measuredSpoilage(recorded(MIN_SPOILAGE_SAMPLES - 1, 3), 2),
    ).toBeNull();
  });

  it("ignores jobs where nobody recorded anything", () => {
    // actual === planned by construction on unrecorded jobs; counting
    // them would drag the measurement to a flattering zero.
    const mixed: SpoilageObservation[] = [
      ...recorded(5, 4),
      ...Array.from({ length: 20 }, () => ({
        planned: 1000,
        actual: null,
        spoiled: null,
      })),
    ];
    const out = measuredSpoilage(mixed, 2)!;
    expect(out.samples).toBe(5);
    expect(out.medianSpoilagePercent).toBe(4);
  });

  it("reports drift against the configured rate", () => {
    const out = measuredSpoilage(recorded(6, 5), 2)!;
    expect(out.drift).toBe(3);
    expect(out.rationale).toContain("above the configured 2%");
  });

  it("says the configured rate is about right when it is", () => {
    const out = measuredSpoilage(recorded(6, 2), 2)!;
    expect(out.drift).toBe(0);
    expect(out.rationale).toContain("about right");
  });

  it("derives waste from actual-vs-planned when no spoilage is logged", () => {
    const out = measuredSpoilage(
      Array.from({ length: 5 }, () => ({
        planned: 1000,
        actual: 1030,
        spoiled: null,
      })),
      2,
    )!;
    expect(out.medianSpoilagePercent).toBe(3);
  });

  it("never reports negative waste from an under-run", () => {
    const out = measuredSpoilage(
      Array.from({ length: 5 }, () => ({
        planned: 1000,
        actual: 900,
        spoiled: null,
      })),
      2,
    )!;
    expect(out.medianSpoilagePercent).toBe(0);
  });

  it("labels itself measured, unlike the estimate", () => {
    expect(measuredSpoilage(recorded(5, 3), 2)!.source).toBe("measured");
  });
});
