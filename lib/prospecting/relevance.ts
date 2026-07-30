import type { DiscoveredProspect } from "./sources/types";

/**
 * Relevance filter — pure, and FAILS CLOSED: unknown input means not
 * relevant, which means no money spent on enrichment.
 * See docs/prospecting.md §5.
 */

export type RelevanceVerdict =
  { relevant: true; reason: string } | { relevant: false; reason: string };

// ── Local sources (Places, permits) ────────────────────────────────

const CATEGORY_ALLOWLIST = [
  "bakery",
  "cafe",
  "coffee",
  "restaurant",
  "brewery",
  "bar",
  "salon",
  "spa",
  "clinic",
  "dental",
  "veterinar",
  "real estate",
  "real_estate",
  "boutique",
  "retail",
  "florist",
  "gym",
  "fitness",
  "hotel",
  "event",
  "catering",
  "food",
  "store",
];

const CATEGORY_DENYLIST = [
  // other print shops are competitors, not prospects
  "print",
  "copy shop",
  "sign shop",
  // national chains do central procurement
  "mcdonald",
  "subway",
  "starbucks",
  "7-eleven",
  "burger king",
  "espresso house",
  "pressbyran",
];

export function isRelevantLocal(
  prospect: DiscoveredProspect,
): RelevanceVerdict {
  const haystack = `${prospect.name} ${prospect.category ?? ""}`.toLowerCase();

  for (const term of CATEGORY_DENYLIST) {
    if (haystack.includes(term)) {
      return { relevant: false, reason: `denylisted (${term})` };
    }
  }
  if (!prospect.address?.line1 || !prospect.address?.postalCode) {
    return { relevant: false, reason: "no usable address" };
  }
  for (const term of CATEGORY_ALLOWLIST) {
    if (haystack.includes(term)) {
      return { relevant: true, reason: `category match (${term})` };
    }
  }
  return { relevant: false, reason: "category not in allowlist" };
}

// ── FDA ────────────────────────────────────────────────────────────

/** Dosage forms implying patient-facing packaging demand: cartons,
 * inserts, blister foil, pharmacy labels. */
const DOSAGE_FORM_ALLOWLIST = [
  "tablet",
  "capsule",
  "solution",
  "suspension",
  "cream",
  "ointment",
  "gel",
  "spray",
  "patch",
  "inhalant",
  "aerosol",
  "lotion",
  "syrup",
  "drops",
  "injection, prefilled",
];

const DOSAGE_FORM_DENYLIST = [
  "for further manufacturing",
  "bulk",
  "powder, for reconstitution",
  "concentrate",
];

const MARKETING_ALLOWLIST = ["prescription", "over-the-counter"];

export type FdaSignal = {
  dosageForm?: string;
  marketingStatus?: string;
  submissionType?: string;
};

export function isRelevantFda(signal: FdaSignal): RelevanceVerdict {
  const form = signal.dosageForm?.toLowerCase().trim();
  const marketing = signal.marketingStatus?.toLowerCase().trim();

  // Fail closed: missing/unknown form means we don't spend
  if (!form) return { relevant: false, reason: "missing dosage form" };

  for (const term of DOSAGE_FORM_DENYLIST) {
    if (form.includes(term)) {
      return { relevant: false, reason: `non-retail presentation (${term})` };
    }
  }
  if (!marketing || !MARKETING_ALLOWLIST.some((m) => marketing.includes(m))) {
    return {
      relevant: false,
      reason: `marketing status "${signal.marketingStatus ?? "unknown"}" not retail`,
    };
  }
  for (const term of DOSAGE_FORM_ALLOWLIST) {
    if (form.includes(term)) {
      return { relevant: true, reason: `packaging-relevant form (${term})` };
    }
  }
  return { relevant: false, reason: `unrecognized dosage form "${form}"` };
}
