import { describe, expect, it } from "vitest";
import {
  buildPermitUrl,
  isArcGisUrl,
  parseFeedDate,
  parsePermitResponse,
  type PermitFeedConfig,
} from "@/lib/prospecting/sources/permit";

/** Austin's Issued Construction Permits, the shipped example. */
const austin: PermitFeedConfig = {
  url: "https://data.austintexas.gov/resource/3syk-w9eu.json",
  termsUrl: "https://data.austintexas.gov/terms-of-use",
  recordIdField: "permit_number",
  nameField: "applicant_organization",
  addressFields: ["original_address1"],
  dateField: "issued_date",
  categoryField: "permit_class",
};

const socrataFixture = [
  {
    permit_number: "2026-071234 BP",
    applicant_organization: "Green Grocer Market LLC",
    original_address1: "412 Congress Ave",
    city: "Austin",
    zip: "78701",
    issued_date: "2026-07-24T00:00:00.000",
    permit_class: "Commercial Remodel",
  },
  {
    permit_number: "2026-071235 BP",
    applicant_organization: "Daily Grind Coffee",
    original_address1: "88 Lamar Blvd",
    issued_date: "2026-07-25T00:00:00.000",
    permit_class: "Restaurant",
  },
  { permit_number: "2026-071236 BP" }, // no applicant name — dropped
  { applicant_organization: "No Permit Number Co" }, // no id — dropped
];

describe("parsePermitResponse (Socrata)", () => {
  const out = parsePermitResponse(socrataFixture, austin);

  it("keeps rows with both an id and a business name", () => {
    expect(out).toHaveLength(2);
    expect(out.map((p) => p.name)).toEqual([
      "Green Grocer Market LLC",
      "Daily Grind Coffee",
    ]);
  });

  it("maps configured fields, not hardcoded ones", () => {
    expect(out[0].externalId).toBe("2026-071234 BP");
    expect(out[0].address?.line1).toBe("412 Congress Ave");
    expect(out[0].address?.city).toBe("Austin");
    expect(out[0].address?.postalCode).toBe("78701");
    expect(out[0].category).toBe("Commercial Remodel");
  });

  it("reads the configured date field as the trigger date", () => {
    expect(out[0].triggeredAt?.toISOString().slice(0, 10)).toBe("2026-07-24");
  });

  it("records the feed and its terms URL in the signal", () => {
    expect(out[0].raw.feed).toBe(austin.url);
    expect(out[0].raw.termsUrl).toBe(austin.termsUrl);
  });

  it("tolerates a garbage payload", () => {
    expect(parsePermitResponse(null, austin)).toEqual([]);
    expect(parsePermitResponse({ nope: 1 }, austin)).toEqual([]);
  });
});

describe("parseFeedDate", () => {
  it("reads a timezone-less feed timestamp as UTC, not local", () => {
    // Otherwise the same feed yields different dates on a UTC+2 laptop
    // and on Vercel (UTC) — shifting recency and the watermark by a day.
    expect(parseFeedDate("2026-07-24T00:00:00.000")?.toISOString()).toBe(
      "2026-07-24T00:00:00.000Z",
    );
  });

  it("respects an explicit zone when the feed supplies one", () => {
    expect(parseFeedDate("2026-07-24T02:00:00+02:00")?.toISOString()).toBe(
      "2026-07-24T00:00:00.000Z",
    );
    expect(parseFeedDate("2026-07-24T00:00:00Z")?.toISOString()).toBe(
      "2026-07-24T00:00:00.000Z",
    );
  });

  it("handles date-only values and rejects nonsense", () => {
    expect(parseFeedDate("2026-07-24")?.toISOString()).toBe(
      "2026-07-24T00:00:00.000Z",
    );
    expect(parseFeedDate("last Tuesday")).toBeUndefined();
    expect(parseFeedDate("")).toBeUndefined();
  });
});

describe("parsePermitResponse (ArcGIS)", () => {
  it("unwraps features[].attributes", () => {
    const out = parsePermitResponse(
      {
        features: [
          {
            attributes: {
              permit_number: "A-1",
              applicant_organization: "Lakeside Diner",
              original_address1: "9 Shore Rd",
              issued_date: "2026-07-20T00:00:00.000",
            },
          },
        ],
      },
      austin,
    );
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Lakeside Diner");
  });
});

describe("buildPermitUrl", () => {
  it("uses Socrata $where/$order/$limit", () => {
    const url = buildPermitUrl(austin, "2026-07-01T00:00:00", 50);
    expect(url).toContain("%24limit=50");
    expect(url).toContain("%24order=issued_date+ASC");
    expect(url).toContain("issued_date+%3E+%272026-07-01T00%3A00%3A00%27");
  });

  it("omits $where on a first run", () => {
    expect(buildPermitUrl(austin, undefined, 50)).not.toContain("%24where");
  });

  it("switches dialect for an ArcGIS FeatureServer", () => {
    const arcgis: PermitFeedConfig = {
      ...austin,
      url: "https://services.arcgis.com/x/ArcGIS/rest/services/Permits/FeatureServer/0/query",
    };
    expect(isArcGisUrl(arcgis.url)).toBe(true);
    const url = buildPermitUrl(arcgis, "2026-07-01", 25);
    expect(url).toContain("f=json");
    expect(url).toContain("outFields=*");
    expect(url).toContain("resultRecordCount=25");
    expect(url).toContain("DATE+%272026-07-01%27");
  });

  it("treats a Socrata resource URL as not-ArcGIS", () => {
    expect(isArcGisUrl(austin.url)).toBe(false);
  });
});
