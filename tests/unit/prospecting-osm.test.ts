import { describe, expect, it } from "vitest";
import {
  buildOverpassQuery,
  parseOverpassResponse,
} from "@/lib/prospecting/sources/osm";
import { isRelevantOsm } from "@/lib/prospecting/relevance";

const fixture = {
  elements: [
    {
      type: "node",
      id: 123456,
      lat: 57.7815,
      lon: 14.1562,
      timestamp: "2026-07-28T09:12:00Z",
      version: 1, // never edited → genuinely newly mapped
      tags: {
        name: "Bageriet Sörgården",
        shop: "bakery",
        "addr:street": "Storgatan",
        "addr:housenumber": "12",
        "addr:city": "Jönköping",
        "addr:postcode": "55311",
        website: "https://sorgarden.example",
        phone: "+46 36 12 34 56",
      },
    },
    {
      type: "way",
      id: 777,
      center: { lat: 57.78, lon: 14.15 },
      timestamp: "2026-07-20T00:00:00Z",
      version: 4, // edited before → existing business, not a new one
      tags: { name: "Café Hörnan", amenity: "cafe" },
    },
    { type: "node", id: 999, tags: { shop: "bakery" } }, // no name — dropped
    { type: "node", id: 1000 }, // no tags at all — dropped
    "not an object", // garbage — dropped
  ],
};

describe("parseOverpassResponse", () => {
  const out = parseOverpassResponse(fixture);

  it("keeps only named elements", () => {
    expect(out).toHaveLength(2);
    expect(out.map((p) => p.name)).toEqual([
      "Bageriet Sörgården",
      "Café Hörnan",
    ]);
  });

  it("builds a stable externalId from type and id", () => {
    expect(out[0].externalId).toBe("node/123456");
    expect(out[1].externalId).toBe("way/777");
  });

  it("decomposes addr:* tags", () => {
    expect(out[0].address).toEqual({
      line1: "Storgatan 12",
      city: "Jönköping",
      postalCode: "55311",
      country: undefined,
    });
    expect(out[0].website).toBe("https://sorgarden.example");
    expect(out[0].phone).toBe("+46 36 12 34 56");
  });

  it("distinguishes a newly mapped element from an edited one", () => {
    expect(out[0].raw.freshlyMapped).toBe(true);
    expect(out[0].triggerReason).toContain("Newly mapped");
    expect(out[1].raw.freshlyMapped).toBe(false);
    expect(out[1].triggerReason).toContain("Discovered");
  });

  it("maps the OSM tag to a category the allowlist understands", () => {
    expect(out[0].category).toBe("bakery");
    expect(out[1].category).toBe("cafe");
  });

  it("carries coordinates for elements with no address", () => {
    expect(out[1].raw.lat).toBe(57.78);
    expect(out[1].raw.lon).toBe(14.15);
  });

  it("reads timestamps as the recency input", () => {
    expect(out[0].triggeredAt?.toISOString()).toBe("2026-07-28T09:12:00.000Z");
  });

  it("tolerates a garbage payload without throwing", () => {
    expect(parseOverpassResponse(null)).toEqual([]);
    expect(parseOverpassResponse({})).toEqual([]);
    expect(parseOverpassResponse({ elements: "nope" })).toEqual([]);
  });
});

describe("buildOverpassQuery", () => {
  const config = {
    categories: ["shop=bakery", "office=*"],
    center: { lat: 57.78, lng: 14.16 },
    radiusMeters: 8000,
  };

  it("emits one selector per category with the radius", () => {
    const query = buildOverpassQuery(config, undefined, 50);
    expect(query).toContain('nwr["shop"="bakery"](around:8000,57.78,14.16)');
    expect(query).toContain('nwr["office"](around:8000,57.78,14.16)'); // key=* → key only
    expect(query).toContain("[out:json]");
    expect(query).toContain("out center meta 50;");
  });

  it("omits the newer filter on a first run, adds it afterwards", () => {
    expect(buildOverpassQuery(config, undefined, 10)).not.toContain("newer");
    expect(
      buildOverpassQuery(config, "2026-07-01T00:00:00Z", 10),
    ).toContain('(newer:"2026-07-01T00:00:00Z")');
  });

  it("refuses to interpolate malformed category config", () => {
    const query = buildOverpassQuery(
      { ...config, categories: ['shop=bakery"];out;//', "garbage"] },
      undefined,
      10,
    );
    expect(query).not.toContain("out;//");
    expect(query).not.toContain("garbage");
  });
});

describe("isRelevantOsm", () => {
  const base = { externalId: "node/1", triggerReason: "t", raw: {} };

  it("accepts a POI with coordinates but no address", () => {
    const verdict = isRelevantOsm({
      ...base,
      name: "Café Hörnan",
      category: "cafe",
      raw: { lat: 57.78, lon: 14.15 },
    });
    expect(verdict.relevant).toBe(true);
  });

  it("rejects a POI with neither address nor coordinates", () => {
    const verdict = isRelevantOsm({
      ...base,
      name: "Café Hörnan",
      category: "cafe",
    });
    expect(verdict.relevant).toBe(false);
    expect(verdict.reason).toContain("no address and no coordinates");
  });

  it("denylists OSM's own copyshop tag — those are competitors", () => {
    const verdict = isRelevantOsm({
      ...base,
      name: "Tryckeriet",
      category: "copyshop",
      raw: { lat: 1, lon: 1 },
    });
    expect(verdict.relevant).toBe(false);
    expect(verdict.reason).toContain("denylisted");
  });

  it("rejects categories outside the allowlist", () => {
    const verdict = isRelevantOsm({
      ...base,
      name: "Statoil",
      category: "fuel",
      raw: { lat: 1, lon: 1 },
    });
    expect(verdict.relevant).toBe(false);
  });
});
