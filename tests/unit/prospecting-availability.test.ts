import { afterEach, describe, expect, it } from "vitest";
import { prospectingConfigSchema } from "@/lib/db/org-settings";
import { createPlacesSource } from "@/lib/prospecting/sources/places";
import { createPermitSource } from "@/lib/prospecting/sources/permit";
import { createOsmSource } from "@/lib/prospecting/sources/osm";
import { openFdaSource } from "@/lib/prospecting/sources/openfda";
import { openFdaDeviceSource } from "@/lib/prospecting/sources/openfda-device";
import { SOURCE_IDS, SOURCE_META } from "@/lib/prospecting/sources/meta";

const ORIGINAL = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe("source availability", () => {
  it("openFDA is always available — it needs no key", () => {
    delete process.env.OPENFDA_API_KEY;
    expect(openFdaSource.isConfigured()).toBe(true);
    expect(openFdaSource.unavailableReason()).toBeUndefined();
  });

  it("Places names the missing key, not a generic failure", () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    const source = createPlacesSource({ queries: ["new bakery"] });
    expect(source.isConfigured()).toBe(false);
    expect(source.unavailableReason()).toContain("GOOGLE_PLACES_API_KEY");
  });

  it("Places distinguishes a missing key from missing queries", () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    const source = createPlacesSource({ queries: [] });
    expect(source.unavailableReason()).toContain("no Places queries");
  });

  it("Places is available with both key and queries", () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    const source = createPlacesSource({ queries: ["new bakery"] });
    expect(source.isConfigured()).toBe(true);
    expect(source.unavailableReason()).toBeUndefined();
  });

  it("openFDA devices need no key either", () => {
    expect(openFdaDeviceSource.isConfigured()).toBe(true);
    expect(openFdaDeviceSource.unavailableReason()).toBeUndefined();
  });

  it("permit points at the org setting, not an env var", () => {
    // The feed is per-org config now; there is no global PERMIT_FEED_URL
    expect(createPermitSource(undefined).unavailableReason()).toContain(
      "no permit feed configured",
    );
  });

  it("permit refuses a feed with no termsUrl", () => {
    const source = createPermitSource({
      url: "https://data.example.gov/resource/abc.json",
      termsUrl: "",
      recordIdField: "id",
      nameField: "name",
      addressFields: [],
    });
    expect(source.unavailableReason()).toContain("termsUrl");
  });

  it("OSM needs a market centre and categories, but never a key", () => {
    expect(
      createOsmSource({ categories: ["shop=bakery"] }).unavailableReason(),
    ).toContain("market centre");
    expect(
      createOsmSource({
        categories: [],
        center: { lat: 57.78, lng: 14.16 },
      }).unavailableReason(),
    ).toContain("categories");
    expect(
      createOsmSource({
        categories: ["shop=bakery"],
        center: { lat: 57.78, lng: 14.16 },
      }).isConfigured(),
    ).toBe(true);
  });

  it("isConfigured() and unavailableReason() never disagree", () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    for (const source of [
      openFdaSource,
      openFdaDeviceSource,
      createPermitSource(undefined),
      createOsmSource({ categories: [] }),
      createOsmSource({
        categories: ["shop=bakery"],
        center: { lat: 57.78, lng: 14.16 },
      }),
      createPlacesSource({ queries: [] }),
      createPlacesSource({ queries: ["x"] }),
    ]) {
      expect(source.isConfigured()).toBe(
        source.unavailableReason() === undefined,
      );
    }
  });
});

describe("per-org source toggles", () => {
  it("defaults match SOURCE_META (permit off — its parser is a stub)", () => {
    const config = prospectingConfigSchema.parse(undefined);
    for (const id of SOURCE_IDS) {
      expect(config.sources[id]).toBe(SOURCE_META[id].defaultEnabled);
    }
    expect(config.sources.permit).toBe(false);
  });

  it("keeps an explicit per-source choice", () => {
    const config = prospectingConfigSchema.parse({
      enabled: true,
      sources: { fda: false, places: true, permit: true },
    });
    // Asserted per-key so adding an agent doesn't break this test
    expect(config.sources.fda).toBe(false);
    expect(config.sources.places).toBe(true);
    expect(config.sources.permit).toBe(true);
  });

  it("fills partial toggle objects from defaults", () => {
    const config = prospectingConfigSchema.parse({
      enabled: true,
      sources: { places: false },
    });
    expect(config.sources.places).toBe(false);
    expect(config.sources.fda).toBe(true); // untouched default
  });

  it("survives legacy configs saved before toggles existed", () => {
    const config = prospectingConfigSchema.parse({
      enabled: true,
      placesQueries: ["new bakery"],
    });
    expect(config.sources.fda).toBe(true);
    expect(config.sources.places).toBe(true);
  });

  it("every registered source has metadata and a toggle", () => {
    const config = prospectingConfigSchema.parse(undefined);
    for (const id of SOURCE_IDS) {
      expect(SOURCE_META[id].label.length).toBeGreaterThan(0);
      expect(typeof config.sources[id]).toBe("boolean");
    }
  });
});
