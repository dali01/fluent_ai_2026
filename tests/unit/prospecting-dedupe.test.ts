import { describe, expect, it } from "vitest";
import { classify, type DedupeIndex } from "@/lib/prospecting/dedupe";
import { locationKey, nameKey } from "@/lib/prospecting/normalize";
import type { DiscoveredProspect } from "@/lib/prospecting/sources/types";

const prospect = (over: Partial<DiscoveredProspect>): DiscoveredProspect => ({
  externalId: "x1",
  name: "Nordic Bakery AB",
  triggerReason: "test",
  raw: {},
  ...over,
});

const emptyIndex = (): DedupeIndex => ({
  externalIds: new Set(),
  locationKeys: new Set(),
  leadNameKeys: new Set(),
  companyNames: [],
});

describe("classify — location mode (Places, permits)", () => {
  it("external-id re-observation is a duplicate", () => {
    const idx = emptyIndex();
    idx.externalIds.add("place-123");
    expect(
      classify(prospect({ externalId: "place-123" }), idx, "location"),
    ).toEqual({
      kind: "duplicate",
      reason: "external-id",
    });
  });

  it("same name + same address is a duplicate", () => {
    const idx = emptyIndex();
    idx.locationKeys.add(locationKey("Nordic Bakery", "Main St 1", "12345")!);
    const verdict = classify(
      prospect({
        name: "Nordic Bakery AB",
        address: { line1: "Main St 1", postalCode: "12345" },
      }),
      idx,
      "location",
    );
    expect(verdict).toEqual({ kind: "duplicate", reason: "location" });
  });

  it("same name + DIFFERENT postal is NOT a duplicate (two branches)", () => {
    const idx = emptyIndex();
    idx.locationKeys.add(locationKey("Nordic Bakery", "Main St 1", "12345")!);
    idx.leadNameKeys.add(nameKey("Nordic Bakery"));
    const verdict = classify(
      prospect({
        name: "Nordic Bakery",
        address: { line1: "Other Rd 9", postalCode: "99999" },
      }),
      idx,
      "location",
    );
    expect(verdict).toEqual({ kind: "new" });
  });

  it("missing address never location-matches", () => {
    const idx = emptyIndex();
    idx.locationKeys.add(locationKey("Nordic Bakery", "Main St 1", "12345")!);
    expect(classify(prospect({ address: undefined }), idx, "location")).toEqual(
      {
        kind: "new",
      },
    );
  });
});

describe("classify — name mode (FDA)", () => {
  it("matches sponsor variants against existing prospects", () => {
    const idx = emptyIndex();
    idx.leadNameKeys.add(nameKey("Teva Pharmaceuticals USA, Inc."));
    const verdict = classify(
      prospect({ name: "TEVA PHARMACEUTICALS USA" }),
      idx,
      "name",
    );
    expect(verdict).toEqual({ kind: "duplicate", reason: "name" });
  });

  it("matches an existing customer as existing-customer, not duplicate", () => {
    const idx = emptyIndex();
    idx.companyNames = ["Teva Pharmaceuticals USA, Inc."];
    const verdict = classify(
      prospect({ name: "TEVA PHARMACEUTICALS USA" }),
      idx,
      "name",
    );
    expect(verdict).toEqual({
      kind: "existing-customer",
      companyName: "Teva Pharmaceuticals USA, Inc.",
    });
  });

  it("never matches on location in name mode", () => {
    const idx = emptyIndex();
    idx.locationKeys.add(locationKey("Sponsor X", "Main St 1", "12345")!);
    const verdict = classify(
      prospect({
        name: "Sponsor X",
        address: { line1: "Main St 1", postalCode: "12345" },
      }),
      idx,
      "name",
    );
    expect(verdict).toEqual({ kind: "new" });
  });

  it("distinct industry tokens stay distinct", () => {
    const idx = emptyIndex();
    idx.leadNameKeys.add(nameKey("Alpha Therapeutics"));
    expect(
      classify(prospect({ name: "Alpha Logistics" }), idx, "name"),
    ).toEqual({
      kind: "new",
    });
  });
});
