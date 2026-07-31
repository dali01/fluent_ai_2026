/**
 * Compliance radar — pure (docs/ai-roadmap.md Tier 3).
 *
 * Federal Register final rules about labelling and packaging name
 * INDUSTRIES, not companies, which is precisely why this is not a
 * prospecting source: it cannot produce a named lead. What it can do is
 * match a rule against customers you already have, turning "new FDA
 * nutrition labelling rule" into "these six food customers must reprint
 * before the compliance date".
 */

export type ComplianceRule = {
  documentNumber: string;
  title: string;
  agencies: string[];
  publishedAt: Date;
  effectiveAt: Date | null;
  url: string;
  abstract: string;
};

export type CustomerProfile = {
  companyId: string;
  name: string;
  /** Company.tags plus anything else describing what they sell */
  tags: string[];
};

export type ComplianceMatch = {
  rule: ComplianceRule;
  customers: Array<{ companyId: string; name: string; matchedOn: string }>;
  /** days until the rule bites; negative when already in force */
  daysUntilEffective: number | null;
  urgency: "in force" | "imminent" | "upcoming" | "no date";
  rationale: string;
};

/**
 * Industry keywords → the customer tags that industry uses. Kept
 * explicit rather than clever: a false match wastes a sales call and
 * makes the shop distrust the whole feature.
 */
export const INDUSTRY_TAGS: Record<string, string[]> = {
  food: ["food", "restaurant", "bakery", "cafe", "catering", "grocery"],
  beverage: ["beverage", "brewery", "distillery", "winery"],
  pharmaceutical: ["pharma", "pharmacy", "drug", "medicine"],
  "medical device": ["medtech", "device", "clinic", "healthcare"],
  cosmetic: ["cosmetic", "beauty", "salon", "spa"],
  supplement: ["supplement", "nutrition", "health"],
  tobacco: ["tobacco", "vape"],
  textile: ["textile", "apparel", "clothing"],
};

const DAY = 86_400_000;

/**
 * Agency boilerplate that contains industry words but says nothing about
 * who a rule affects. "Food and Drug Administration" appears on every
 * FDA device rule and made restaurants match medical-device regulations.
 */
const AGENCY_NOISE = [
  "food and drug administration",
  "department of agriculture",
  "food safety and inspection service",
];

/** Which industries does this rule speak to? */
export function industriesInRule(rule: ComplianceRule): string[] {
  let haystack = `${rule.title} ${rule.abstract}`.toLowerCase();
  for (const phrase of AGENCY_NOISE) {
    haystack = haystack.replaceAll(phrase, " ");
  }
  return Object.keys(INDUSTRY_TAGS).filter((industry) =>
    haystack.includes(industry),
  );
}

export function matchRuleToCustomers(
  rule: ComplianceRule,
  customers: CustomerProfile[],
  now: Date,
): ComplianceMatch | null {
  const industries = industriesInRule(rule);
  if (industries.length === 0) return null;

  // Match per industry rather than against the union of every affected
  // industry's tags: a rule naming both "food" and "medical device"
  // must not pull in a restaurant on the strength of the device half.
  const matched: ComplianceMatch["customers"] = [];
  for (const customer of customers) {
    const tags = customer.tags.map((t) => t.trim().toLowerCase());
    for (const industry of industries) {
      const hit = tags.find((t) => INDUSTRY_TAGS[industry].includes(t));
      if (hit) {
        matched.push({
          companyId: customer.companyId,
          name: customer.name,
          matchedOn: `${industry} (${hit})`,
        });
        break; // one row per customer, whichever industry caught them
      }
    }
  }
  // A rule affecting none of your customers is noise, not a signal.
  if (matched.length === 0) return null;

  const daysUntilEffective = rule.effectiveAt
    ? Math.round((rule.effectiveAt.getTime() - now.getTime()) / DAY)
    : null;
  const urgency: ComplianceMatch["urgency"] =
    daysUntilEffective === null
      ? "no date"
      : daysUntilEffective < 0
        ? "in force"
        : daysUntilEffective <= 90
          ? "imminent"
          : "upcoming";

  const when =
    daysUntilEffective === null
      ? "no compliance date stated"
      : daysUntilEffective < 0
        ? `already in force since ${rule.effectiveAt!.toISOString().slice(0, 10)}`
        : `effective ${rule.effectiveAt!.toISOString().slice(0, 10)} (${daysUntilEffective} days)`;

  return {
    rule,
    customers: matched,
    daysUntilEffective,
    urgency,
    rationale: `${matched.length} customer${matched.length === 1 ? "" : "s"} in ${industries.join("/")} may need reprints — ${when}.`,
  };
}

const URGENCY_ORDER: Record<ComplianceMatch["urgency"], number> = {
  imminent: 0,
  "in force": 1,
  upcoming: 2,
  "no date": 3,
};

export function matchRules(
  rules: ComplianceRule[],
  customers: CustomerProfile[],
  now: Date,
): ComplianceMatch[] {
  return rules
    .map((rule) => matchRuleToCustomers(rule, customers, now))
    .filter((m): m is ComplianceMatch => m !== null)
    .sort(
      (a, b) =>
        URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency] ||
        b.customers.length - a.customers.length,
    );
}
