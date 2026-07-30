import { describe, expect, it } from "vitest";
import {
  isLikelySameName,
  locationKey,
  nameKey,
  normalizeBusinessName,
} from "@/lib/prospecting/normalize";

describe("normalizeBusinessName", () => {
  it("strips diacritics and casefolds", () => {
    expect(normalizeBusinessName("Café Ölandsbröd")).toBe("cafe olandsbrod");
  });

  it("strips legal suffixes but keeps the core", () => {
    expect(normalizeBusinessName("The Print Co.")).toBe("print");
    expect(normalizeBusinessName("Nordic Bakery AB")).toBe("nordic bakery");
    expect(normalizeBusinessName("Acme Holdings Ltd.")).toBe("acme holdings");
  });

  it("strips stacked suffixes", () => {
    expect(normalizeBusinessName("Foo Bar Company Inc")).toBe("foo bar");
  });

  it("never strips industry tokens", () => {
    expect(normalizeBusinessName("Alpha Therapeutics Inc")).toBe(
      "alpha therapeutics",
    );
    expect(normalizeBusinessName("Beta Pharms LLC")).toBe("beta pharms");
    expect(normalizeBusinessName("Gamma Labs Ltd")).toBe("gamma labs");
  });

  it("normalizes ampersands and leading 'the'", () => {
    expect(normalizeBusinessName("The Smith & Sons")).toBe("smith and sons");
  });

  it("is idempotent", () => {
    const inputs = ["Café Ölandsbröd AB", "The Print Co.", "Smith & Sons Inc"];
    for (const input of inputs) {
      const once = normalizeBusinessName(input);
      expect(normalizeBusinessName(once)).toBe(once);
    }
  });

  it("does not strip a suffix that is the whole name", () => {
    expect(normalizeBusinessName("Co")).toBe("co");
  });
});

describe("nameKey / isLikelySameName", () => {
  it("matches the Teva sponsor variants", () => {
    expect(
      isLikelySameName(
        "Teva Pharmaceuticals USA, Inc.",
        "TEVA PHARMACEUTICALS USA",
      ),
    ).toBe(true);
  });

  it("is order-insensitive", () => {
    expect(isLikelySameName("USA Teva Pharms", "Teva Pharms USA")).toBe(true);
  });

  it("keeps different industry tokens distinct", () => {
    expect(isLikelySameName("Alpha Therapeutics", "Alpha Logistics")).toBe(
      false,
    );
    expect(isLikelySameName("Teva Pharms", "Teva Pharmaceuticals")).toBe(false);
  });

  it("empty names never match", () => {
    expect(isLikelySameName("", "")).toBe(false);
  });

  it("nameKey dedupes repeated tokens", () => {
    expect(nameKey("Print Print AB")).toBe("print");
  });
});

describe("locationKey", () => {
  it("is null without street or postal", () => {
    expect(locationKey("Nordic Bakery", null, "12345")).toBeNull();
    expect(locationKey("Nordic Bakery", "Main St 1", null)).toBeNull();
    expect(locationKey("Nordic Bakery", "", "")).toBeNull();
  });

  it("builds a stable composite key", () => {
    expect(locationKey("Nordic Bakery AB", "Main   St 1", "123 45")).toBe(
      "nordic bakery|main st 1|12345",
    );
  });
});
