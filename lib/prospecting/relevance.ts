import type { RelevanceKind } from "./sources/meta";
import type { DiscoveredProspect } from "./sources/types";

/**
 * Relevance filter — pure, and FAILS CLOSED: unknown input means not
 * relevant, which means no money spent on enrichment.
 * See docs/prospecting.md §5.
 */

export type RelevanceVerdict =
  | { relevant: true; reason: string }
  | { relevant: false; reason: string };

/**
 * The ONE dispatch point. Exhaustive switch: a new RelevanceKind is a
 * compile error here rather than a source silently inheriting the local
 * screen (which hard-requires a street address and would reject 100% of
 * a non-local source while reporting a successful run).
 */
export function screenProspect(
  kind: RelevanceKind,
  prospect: DiscoveredProspect,
): RelevanceVerdict {
  switch (kind) {
    case "local":
      return isRelevantLocal(prospect);
    case "osm":
      return isRelevantOsm(prospect);
    case "fda-drug":
      return isRelevantFda({
        dosageForm: prospect.raw.dosageForm as string | undefined,
        marketingStatus: prospect.raw.marketingStatus as string | undefined,
        submissionType: prospect.raw.submissionType as string | undefined,
      });
    case "fda-device":
      return isRelevantDevice({
        decisionCode: prospect.raw.decisionCode as string | undefined,
        deviceName: prospect.raw.deviceName as string | undefined,
      });
    case "filing":
      return isRelevantFiling({
        formType: prospect.raw.formType as string | undefined,
      });
    case "trademark":
      return isRelevantTrademark({
        classes: prospect.raw.classes as string[] | undefined,
        ownerName: prospect.raw.ownerName as string | undefined,
      });
  }
}

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
  "copyshop", // OSM spells it shop=copyshop
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

/**
 * OpenStreetMap: same vocabulary as the local screen, but OSM POIs
 * routinely lack `addr:*` tags. Requiring a street address (as the
 * Places/permit screen does) would reject most of the map, so accept an
 * address OR coordinates — the OSM node id is a stable externalId, so
 * dedupe holds either way. The competitor denylist still applies.
 */
export function isRelevantOsm(prospect: DiscoveredProspect): RelevanceVerdict {
  const haystack = `${prospect.name} ${prospect.category ?? ""}`.toLowerCase();

  for (const term of CATEGORY_DENYLIST) {
    if (haystack.includes(term)) {
      return { relevant: false, reason: `denylisted (${term})` };
    }
  }
  const hasAddress = Boolean(prospect.address?.line1);
  const hasCoords =
    typeof prospect.raw.lat === "number" && typeof prospect.raw.lon === "number";
  if (!hasAddress && !hasCoords) {
    return { relevant: false, reason: "no address and no coordinates" };
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

/**
 * FDA 510(k) devices. Every cleared device needs labelling, so the
 * screen is about the DECISION rather than the product: keep only
 * substantially-equivalent clearances (the device may now be marketed).
 * Fails closed on unknown decision codes.
 */
const DEVICE_DECISION_ALLOWLIST = ["sese", "sesu", "sesk", "sesr", "sesp"];

export type DeviceSignal = { decisionCode?: string; deviceName?: string };

export function isRelevantDevice(signal: DeviceSignal): RelevanceVerdict {
  const code = signal.decisionCode?.toLowerCase().trim();
  if (!code) return { relevant: false, reason: "missing decision code" };
  if (!signal.deviceName?.trim()) {
    return { relevant: false, reason: "missing device name" };
  }
  if (!DEVICE_DECISION_ALLOWLIST.includes(code)) {
    return {
      relevant: false,
      reason: `decision code "${signal.decisionCode}" is not a marketable clearance`,
    };
  }
  return { relevant: true, reason: `cleared for market (${code})` };
}

/**
 * SEC filings. Only forms that imply a printing job: a registration
 * statement (prospectus) or an annual proxy (mailed to every holder).
 */
const FILING_FORM_ALLOWLIST = ["s-1", "s-1/a", "def 14a", "424b4"];

export type FilingSignal = { formType?: string };

export function isRelevantFiling(signal: FilingSignal): RelevanceVerdict {
  const form = signal.formType?.toLowerCase().trim();
  if (!form) return { relevant: false, reason: "missing form type" };
  if (!FILING_FORM_ALLOWLIST.includes(form)) {
    return { relevant: false, reason: `form ${signal.formType} implies no print` };
  }
  return { relevant: true, reason: `print-bearing filing (${form})` };
}

/**
 * Trademarks. A new mark means new packaging — except when the
 * applicant is a printing company (Nice class 40 covers printing
 * services), which makes them a competitor.
 */
const TRADEMARK_COMPETITOR_CLASSES = ["40"];

export type TrademarkSignal = { classes?: string[]; ownerName?: string };

export function isRelevantTrademark(signal: TrademarkSignal): RelevanceVerdict {
  if (!signal.ownerName?.trim()) {
    return { relevant: false, reason: "missing owner name" };
  }
  const classes = (signal.classes ?? []).map((c) => c.trim()).filter(Boolean);
  if (classes.length === 0) {
    return { relevant: false, reason: "no goods/services classes" };
  }
  const competitor = classes.find((c) =>
    TRADEMARK_COMPETITOR_CLASSES.includes(c),
  );
  if (competitor) {
    return {
      relevant: false,
      reason: `class ${competitor} is printing services — a competitor`,
    };
  }
  return { relevant: true, reason: `new mark in class ${classes.join("/")}` };
}
