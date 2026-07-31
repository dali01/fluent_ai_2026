import { describe, expect, it } from "vitest";
import { parseFederalRegister } from "@/lib/compliance/federal-register";
import {
  industriesInRule,
  matchRuleToCustomers,
  matchRules,
  type ComplianceRule,
  type CustomerProfile,
} from "@/lib/compliance/rules";

const NOW = new Date("2026-07-31T00:00:00Z");

const foodRule: ComplianceRule = {
  documentNumber: "2026-11111",
  title: "Food Labeling: Revision of the Nutrition Facts Panel",
  agencies: ["Food and Drug Administration"],
  publishedAt: new Date("2026-06-01T00:00:00Z"),
  effectiveAt: new Date("2026-09-01T00:00:00Z"),
  url: "https://www.federalregister.gov/d/2026-11111",
  abstract: "Requires updated nutrition labeling on packaged food products.",
};

const customers: CustomerProfile[] = [
  { companyId: "c1", name: "Nordic Bistro Group", tags: ["restaurant"] },
  { companyId: "c2", name: "Kronan Apotek Syd", tags: ["pharma"] },
  { companyId: "c3", name: "Studio Nord", tags: ["agency"] },
];

describe("industriesInRule", () => {
  it("finds the industry a rule speaks to", () => {
    expect(industriesInRule(foodRule)).toContain("food");
  });

  it("returns nothing for a rule about neither labels nor an industry", () => {
    expect(
      industriesInRule({ ...foodRule, title: "Bridge Tolls", abstract: "" }),
    ).toEqual([]);
  });
});

describe("matchRuleToCustomers", () => {
  it("matches customers whose tags belong to the affected industry", () => {
    const match = matchRuleToCustomers(foodRule, customers, NOW)!;
    expect(match.customers).toHaveLength(1);
    expect(match.customers[0].name).toBe("Nordic Bistro Group");
    expect(match.customers[0].matchedOn).toBe("food (restaurant)");
  });

  it("returns null when a rule affects none of your customers", () => {
    // The signal is "your customers must reprint", not "a rule exists"
    expect(matchRuleToCustomers(foodRule, [customers[2]], NOW)).toBeNull();
  });

  it("marks a rule taking effect within 90 days as imminent", () => {
    expect(matchRuleToCustomers(foodRule, customers, NOW)!.urgency).toBe(
      "imminent",
    );
  });

  it("marks a rule already past its date as in force", () => {
    const past = {
      ...foodRule,
      effectiveAt: new Date("2026-01-01T00:00:00Z"),
    };
    const match = matchRuleToCustomers(past, customers, NOW)!;
    expect(match.urgency).toBe("in force");
    expect(match.daysUntilEffective).toBeLessThan(0);
    expect(match.rationale).toContain("already in force");
  });

  it("handles a rule with no compliance date", () => {
    const match = matchRuleToCustomers(
      { ...foodRule, effectiveAt: null },
      customers,
      NOW,
    )!;
    expect(match.urgency).toBe("no date");
    expect(match.daysUntilEffective).toBeNull();
  });

  it("matches pharmaceutical rules to pharmacy customers", () => {
    const rule: ComplianceRule = {
      ...foodRule,
      title: "Pharmaceutical Labeling Requirements",
      abstract: "Updates to pharmaceutical package inserts.",
    };
    const match = matchRuleToCustomers(rule, customers, NOW)!;
    expect(match.customers[0].name).toBe("Kronan Apotek Syd");
  });
});

describe("false positives found against the live Federal Register", () => {
  const deviceRule: ComplianceRule = {
    ...foodRule,
    title: "Medical Devices; Radiology Devices; Classification of the Fiducial",
    abstract:
      "The Food and Drug Administration is classifying the device into class II.",
  };

  it("ignores industry words inside an agency's name", () => {
    // "Food and Drug Administration" appears on every FDA device rule
    // and used to make it a 'food' rule.
    expect(industriesInRule(deviceRule)).not.toContain("food");
    expect(industriesInRule(deviceRule)).toContain("medical device");
  });

  it("does not match a restaurant to a medical-device rule", () => {
    expect(matchRuleToCustomers(deviceRule, customers, NOW)).toBeNull();
  });

  it("matches each customer via the industry that actually caught them", () => {
    const both: ComplianceRule = {
      ...foodRule,
      title: "Labeling for food and medical device products",
      abstract: "Affects packaged food and medical device labeling.",
    };
    const match = matchRuleToCustomers(
      both,
      [...customers, { companyId: "c4", name: "MedCo", tags: ["medtech"] }],
      NOW,
    )!;
    const byName = Object.fromEntries(
      match.customers.map((c) => [c.name, c.matchedOn]),
    );
    expect(byName["Nordic Bistro Group"]).toContain("food");
    expect(byName["MedCo"]).toContain("medical device");
  });
});

describe("matchRules", () => {
  it("puts imminent rules before those already in force or distant", () => {
    const out = matchRules(
      [
        { ...foodRule, effectiveAt: new Date("2027-06-01T00:00:00Z") }, // upcoming
        foodRule, // imminent
      ],
      customers,
      NOW,
    );
    expect(out[0].urgency).toBe("imminent");
  });

  it("drops rules matching nobody", () => {
    expect(matchRules([foodRule], [customers[2]], NOW)).toEqual([]);
  });
});

describe("parseFederalRegister", () => {
  const fixture = {
    results: [
      {
        document_number: "2026-11111",
        title: "Food Labeling: Nutrition Facts",
        abstract: "Updated labeling for packaged food.",
        publication_date: "2026-06-01",
        effective_on: "2026-09-01",
        html_url: "https://www.federalregister.gov/d/2026-11111",
        agencies: [{ name: "Food and Drug Administration" }],
      },
      {
        document_number: "2026-22222",
        title: "No effective date given",
        publication_date: "2026-06-15",
        effective_on: null,
        html_url: "https://www.federalregister.gov/d/2026-22222",
      },
      { title: "No document number — dropped" },
    ],
  };

  it("parses rules and keeps a null effective date as null", () => {
    const out = parseFederalRegister(fixture);
    expect(out).toHaveLength(2);
    expect(out[0].effectiveAt?.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(out[1].effectiveAt).toBeNull();
    expect(out[0].agencies).toEqual(["Food and Drug Administration"]);
  });

  it("tolerates garbage rather than throwing", () => {
    expect(parseFederalRegister(null)).toEqual([]);
    expect(parseFederalRegister({ results: "nope" })).toEqual([]);
  });
});
