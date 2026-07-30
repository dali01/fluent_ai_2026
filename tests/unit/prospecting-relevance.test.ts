import { describe, expect, it } from "vitest";
import { enrichmentGate } from "@/lib/prospecting/gate";
import { isRelevantFda, isRelevantLocal } from "@/lib/prospecting/relevance";
import type { DiscoveredProspect } from "@/lib/prospecting/sources/types";

const local = (over: Partial<DiscoveredProspect>): DiscoveredProspect => ({
  externalId: "x",
  name: "Nordic Bakery",
  triggerReason: "t",
  category: "bakery",
  address: { line1: "Main St 1", postalCode: "12345" },
  raw: {},
  ...over,
});

describe("isRelevantLocal", () => {
  it("accepts allowlisted categories with an address", () => {
    expect(isRelevantLocal(local({})).relevant).toBe(true);
  });

  it("rejects competitors (print shops)", () => {
    expect(
      isRelevantLocal(
        local({ name: "Speedy Print AB", category: "print shop" }),
      ).relevant,
    ).toBe(false);
  });

  it("rejects national chains", () => {
    expect(
      isRelevantLocal(local({ name: "Starbucks Coffee", category: "cafe" }))
        .relevant,
    ).toBe(false);
  });

  it("rejects missing address (fail closed)", () => {
    expect(isRelevantLocal(local({ address: undefined })).relevant).toBe(false);
  });

  it("rejects unknown categories (fail closed)", () => {
    expect(
      isRelevantLocal(local({ name: "Foo", category: "quantum computing" }))
        .relevant,
    ).toBe(false);
  });
});

describe("isRelevantFda — dosage-form matrix", () => {
  const cases: Array<[string, string, boolean]> = [
    ["TABLET", "Prescription", true],
    ["CAPSULE", "Over-the-counter", true],
    ["SOLUTION, ORAL", "Prescription", true],
    ["CREAM", "Prescription", true],
    ["INJECTION, PREFILLED", "Prescription", true],
    ["POWDER, FOR RECONSTITUTION", "Prescription", false],
    ["BULK INGREDIENT", "Prescription", false],
    ["FOR FURTHER MANUFACTURING USE", "Prescription", false],
    ["TABLET", "Discontinued", false],
  ];

  for (const [form, marketing, expected] of cases) {
    it(`${form} / ${marketing} → ${expected}`, () => {
      expect(
        isRelevantFda({ dosageForm: form, marketingStatus: marketing })
          .relevant,
      ).toBe(expected);
    });
  }

  it("missing dosage form → not relevant (fail closed = don't spend)", () => {
    expect(isRelevantFda({ marketingStatus: "Prescription" }).relevant).toBe(
      false,
    );
  });

  it("unknown dosage form → not relevant", () => {
    expect(
      isRelevantFda({ dosageForm: "HOLOGRAM", marketingStatus: "Prescription" })
        .relevant,
    ).toBe(false);
  });
});

describe("enrichmentGate", () => {
  const base = {
    relevant: true,
    score: 80,
    minScore: 60,
    enrichedThisRun: 0,
    maxPerRun: 10,
  };

  it("enriches when all conditions pass", () => {
    expect(enrichmentGate(base)).toBe("ENRICH");
  });

  it("skips irrelevant prospects", () => {
    expect(enrichmentGate({ ...base, relevant: false })).toBe("SKIPPED");
  });

  it("skips below the score floor", () => {
    expect(enrichmentGate({ ...base, score: 59 })).toBe("SKIPPED");
  });

  it("defers (PENDING) on budget exhaustion", () => {
    expect(enrichmentGate({ ...base, enrichedThisRun: 10 })).toBe("PENDING");
  });
});
