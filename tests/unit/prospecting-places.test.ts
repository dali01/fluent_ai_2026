import { describe, expect, it } from "vitest";
import { parsePlacesResponse } from "@/lib/prospecting/sources/places";

const fixture = {
  places: [
    {
      id: "ChIJabc123",
      displayName: { text: "Nya Kvarterets Bageri" },
      formattedAddress: "Storgatan 12, 553 20 Jönköping, Sweden",
      addressComponents: [
        { longText: "12", types: ["street_number"] },
        { longText: "Storgatan", types: ["route"] },
        { longText: "Jönköping", types: ["postal_town"] },
        { longText: "553 20", types: ["postal_code"] },
        { longText: "Sweden", types: ["country"] },
      ],
      primaryType: "bakery",
      websiteUri: "https://kvarteretsbageri.example",
      nationalPhoneNumber: "036-12 34 56",
    },
    { id: "ChIJnoname", primaryType: "cafe" }, // no display name — dropped
  ],
};

describe("parsePlacesResponse", () => {
  it("maps a place to a DiscoveredProspect with structured address", () => {
    const out = parsePlacesResponse(fixture);
    expect(out).toHaveLength(1);
    expect(out[0].externalId).toBe("ChIJabc123");
    expect(out[0].name).toBe("Nya Kvarterets Bageri");
    expect(out[0].category).toBe("bakery");
    expect(out[0].address).toEqual({
      line1: "Storgatan 12",
      city: "Jönköping",
      postalCode: "553 20",
      country: "Sweden",
    });
    expect(out[0].website).toBe("https://kvarteretsbageri.example");
  });

  it("falls back to the first formattedAddress segment for line1", () => {
    const out = parsePlacesResponse({
      places: [
        {
          id: "x",
          displayName: { text: "Foo" },
          formattedAddress: "Main St 1, Town",
        },
      ],
    });
    expect(out[0].address?.line1).toBe("Main St 1");
  });

  it("degrades to [] on malformed payloads", () => {
    expect(parsePlacesResponse(null)).toEqual([]);
    expect(parsePlacesResponse({})).toEqual([]);
    expect(parsePlacesResponse({ places: [{ nope: 1 }] })).toEqual([]);
  });
});
