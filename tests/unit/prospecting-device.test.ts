import { describe, expect, it } from "vitest";
import { parseDeviceResponse } from "@/lib/prospecting/sources/openfda-device";
import { isRelevantDevice } from "@/lib/prospecting/relevance";

const fixture = {
  results: [
    {
      k_number: "K261234",
      applicant: "Nordic Medtech AB",
      device_name: "GlucoTrack Continuous Monitor",
      decision_code: "SESE",
      decision_date: "2026-07-22",
      product_code: "MDS",
      clearance_type: "Traditional",
      address_1: "Industrigatan 4",
      city: "Malmö",
      state: "N/A",
      postal_code: "21120",
      country_code: "SE",
    },
    {
      k_number: "K269999",
      applicant: "Halted Devices Inc",
      device_name: "Experimental Widget",
      decision_code: "STWD", // withdrawn — not marketable
      decision_date: "2026-07-21",
    },
    { k_number: "K260000", device_name: "Orphan device" }, // no applicant — dropped
    { applicant: "No Number Co" }, // no k_number — dropped
  ],
};

describe("parseDeviceResponse", () => {
  const out = parseDeviceResponse(fixture);

  it("keeps records that name an applicant", () => {
    expect(out).toHaveLength(2);
    expect(out.map((p) => p.name)).toEqual([
      "Nordic Medtech AB",
      "Halted Devices Inc",
    ]);
  });

  it("uses the k-number as the externalId", () => {
    expect(out[0].externalId).toBe("K261234");
  });

  it("reads the applicant address", () => {
    expect(out[0].address).toEqual({
      line1: "Industrigatan 4",
      city: "Malmö",
      postalCode: "21120",
      country: "SE",
    });
  });

  it("uses decision_date as the recency input", () => {
    expect(out[0].triggeredAt?.toISOString()).toBe("2026-07-22T00:00:00.000Z");
  });

  it("puts the decision code in raw for the relevance screen", () => {
    expect(out[0].raw.decisionCode).toBe("SESE");
    expect(out[0].raw.deviceName).toBe("GlucoTrack Continuous Monitor");
  });

  it("names the device in the trigger reason", () => {
    expect(out[0].triggerReason).toContain("510(k)");
    expect(out[0].triggerReason).toContain("GlucoTrack");
  });

  it("tolerates a garbage payload", () => {
    expect(parseDeviceResponse(null)).toEqual([]);
    expect(parseDeviceResponse({ results: "nope" })).toEqual([]);
    expect(parseDeviceResponse({})).toEqual([]);
  });
});

describe("isRelevantDevice", () => {
  it("accepts a substantially-equivalent clearance", () => {
    const verdict = isRelevantDevice({
      decisionCode: "SESE",
      deviceName: "Monitor",
    });
    expect(verdict.relevant).toBe(true);
  });

  it("rejects a withdrawn or non-marketable decision", () => {
    const verdict = isRelevantDevice({
      decisionCode: "STWD",
      deviceName: "Widget",
    });
    expect(verdict.relevant).toBe(false);
    expect(verdict.reason).toContain("not a marketable clearance");
  });

  it("fails closed on an unknown or missing code", () => {
    expect(isRelevantDevice({ deviceName: "x" }).relevant).toBe(false);
    expect(
      isRelevantDevice({ decisionCode: "ZZZZ", deviceName: "x" }).relevant,
    ).toBe(false);
  });

  it("requires a device name", () => {
    expect(isRelevantDevice({ decisionCode: "SESE" }).relevant).toBe(false);
  });

  it("is case-insensitive about the decision code", () => {
    expect(
      isRelevantDevice({ decisionCode: "sese", deviceName: "x" }).relevant,
    ).toBe(true);
  });
});
