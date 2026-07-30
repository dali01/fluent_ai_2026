import { describe, expect, it } from "vitest";
import { parseOpenFdaResponse } from "@/lib/prospecting/sources/openfda";

const fixture = {
  results: [
    {
      application_number: "NDA021436",
      sponsor_name: "Acme Pharma Inc",
      submissions: [
        {
          submission_type: "ORIG",
          submission_number: "1",
          submission_status: "AP",
          submission_status_date: "20260715",
        },
        {
          submission_type: "SUPPL",
          submission_number: "12",
          submission_status: "AP",
          submission_status_date: "20260720",
        },
        {
          submission_type: "SUPPL",
          submission_number: "13",
          submission_status: "TA", // not approved — ignored
          submission_status_date: "20260725",
        },
      ],
      products: [
        {
          brand_name: "Brandex",
          dosage_form: "TABLET",
          route: "ORAL",
          marketing_status: "Prescription",
        },
      ],
    },
    {
      // Non-NDA/ANDA/BLA application type — dropped
      application_number: "EUA000123",
      sponsor_name: "Emergency Corp",
      submissions: [
        {
          submission_type: "ORIG",
          submission_number: "1",
          submission_status: "AP",
          submission_status_date: "20260710",
        },
      ],
      products: [{ brand_name: "X", dosage_form: "TABLET" }],
    },
    {
      // No approved submissions — dropped
      application_number: "ANDA555555",
      sponsor_name: "Pending Labs",
      submissions: [
        {
          submission_type: "ORIG",
          submission_number: "1",
          submission_status: "RL",
          submission_status_date: "20260701",
        },
      ],
      products: [{ brand_name: "Y", dosage_form: "CAPSULE" }],
    },
  ],
};

describe("parseOpenFdaResponse", () => {
  it("emits ONE prospect per application, keyed by the latest approved submission", () => {
    const out = parseOpenFdaResponse(fixture);
    expect(out).toHaveLength(1);
    expect(out[0].externalId).toBe("NDA021436:SUPPL12");
    expect(out[0].name).toBe("Acme Pharma Inc");
    expect(out[0].triggerReason).toContain("Brandex");
    expect(out[0].triggeredAt?.toISOString().slice(0, 10)).toBe("2026-07-20");
    expect(out[0].raw.dosageForm).toBe("TABLET");
  });

  it("degrades to [] on malformed payloads", () => {
    expect(parseOpenFdaResponse(null)).toEqual([]);
    expect(parseOpenFdaResponse("not json-shaped")).toEqual([]);
    expect(parseOpenFdaResponse({ error: { code: "NOT_FOUND" } })).toEqual([]);
    expect(parseOpenFdaResponse({ results: [{ garbage: true }] })).toEqual([]);
  });

  it("drops rows without a sponsor name", () => {
    const out = parseOpenFdaResponse({
      results: [
        {
          application_number: "NDA000001",
          submissions: [
            {
              submission_type: "ORIG",
              submission_number: "1",
              submission_status: "AP",
              submission_status_date: "20260715",
            },
          ],
        },
      ],
    });
    expect(out).toEqual([]);
  });

  it("survives a missing status date", () => {
    const out = parseOpenFdaResponse({
      results: [
        {
          application_number: "NDA000002",
          sponsor_name: "NoDate Pharma",
          submissions: [
            {
              submission_type: "ORIG",
              submission_number: "1",
              submission_status: "AP",
            },
          ],
          products: [{ brand_name: "Z", dosage_form: "GEL" }],
        },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].triggeredAt).toBeUndefined();
  });
});
