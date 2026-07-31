// Type-only import — erased at compile time, so this module stays
// client-safe (no Prisma runtime in the browser bundle).
import type { ProspectSource as ProspectSourceEnum } from "@/lib/generated/prisma/enums";

/**
 * Source identities + per-source POLICY — a PURE module with no runtime
 * imports, so client components can render the agent list without
 * dragging fetch/Prisma into the browser bundle (the lib/format vs
 * lib/db lesson in DECISIONS.md). The registry that constructs
 * connectors lives in ./index.ts.
 *
 * This is the single source of truth for everything the pipeline needs
 * to know about a source. `Record<SourceId, SourceMeta>` is exhaustive,
 * so adding an id here is a COMPILE ERROR until its enum value, dedupe
 * mode and relevance screen are all declared — previously each was a
 * separate lookup that failed silently (DECISIONS.md).
 */

export const SOURCE_IDS = [
  "fda",
  "places",
  "permit",
  "osm",
  "fda_device",
] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

/** Which screening function guards this source (see lib/prospecting/relevance.ts). */
export type RelevanceKind =
  | "local"
  | "osm"
  | "fda-drug"
  | "fda-device"
  | "filing"
  | "trademark";

export type SourceMeta = {
  id: SourceId;
  /** short label for chips and buttons */
  label: string;
  /** what the agent watches, in one line */
  watches: string;
  /** what a printer gets out of it */
  value: string;
  /** the Prisma enum value written to Lead.prospectSource / SourceRun.source */
  enumValue: ProspectSourceEnum;
  /** identity rule: "name" gives existing-customer upsell detection */
  dedupeMode: "name" | "location";
  /** relevance screen — never defaults, or a source silently screens out 100% */
  relevance: RelevanceKind;
  /** env var the connector needs, if any */
  requiresEnv?: string;
  /** true when the connector itself is not implemented yet */
  stub?: boolean;
  /** enabled by default for a new organization */
  defaultEnabled: boolean;
  /** attribution line that must be displayed when rows from this source are shown */
  attribution?: string;
  /** Tailwind classes for the source badge (token-based, no hex) */
  badgeClass: string;
  /** how outreach drafts should pitch this trigger (lib/ai/outreach.ts) */
  outreachAngle: string;
};

export const SOURCE_META: Record<SourceId, SourceMeta> = {
  fda: {
    id: "fda",
    label: "FDA approvals",
    watches: "openFDA drug application approvals",
    value:
      "Cartons, inserts, blister foil and pharmacy labels — weeks of runway",
    enumValue: "FDA",
    dedupeMode: "name",
    relevance: "fda-drug",
    defaultEnabled: true,
    badgeClass: "bg-chart-2/10 text-chart-2",
    outreachAngle:
      "Their drug approval just cleared — they will need cartons, package inserts, blister foil and pharmacy labels with a compliance-grade print partner. Procurement runway is weeks, tone is B2B-professional.",
  },
  places: {
    id: "places",
    label: "Places discovery",
    watches: "Google Places text search over your market queries",
    value: "Local businesses in your categories you have never quoted",
    enumValue: "PLACES",
    dedupeMode: "location",
    relevance: "local",
    requiresEnv: "GOOGLE_PLACES_API_KEY",
    defaultEnabled: true,
    badgeClass: "bg-chart-1/10 text-chart-1",
    outreachAngle:
      "An established local business we have not worked with. Lead with one concrete idea for their category, not a generic pitch.",
  },
  permit: {
    id: "permit",
    label: "Permits & licences",
    watches: "A municipal open-data permit or licence feed",
    value: "Signage, cards, menus and window graphics, needed immediately",
    enumValue: "PERMIT",
    dedupeMode: "location",
    relevance: "local",
    defaultEnabled: false,
    badgeClass: "bg-chart-3/10 text-chart-3",
    outreachAngle:
      "They JUST opened or licensed a new business — they need signage, business cards, menus and window graphics immediately. Tone is warm, local, congratulatory.",
  },
  osm: {
    id: "osm",
    label: "OpenStreetMap",
    watches: "Newly mapped businesses around your market centre (keyless)",
    value: "Free local discovery — no API key, no per-query billing",
    enumValue: "OSM",
    dedupeMode: "location",
    relevance: "osm",
    defaultEnabled: true,
    attribution: "© OpenStreetMap contributors",
    badgeClass: "bg-chart-5/10 text-chart-5",
    outreachAngle:
      "A local business we found on the map and have never quoted. Lead with one concrete, category-specific idea; do NOT imply we know anything about their current supplier or that they are newly opened.",
  },
  fda_device: {
    id: "fda_device",
    label: "FDA devices",
    watches: "openFDA 510(k) medical-device clearances (keyless)",
    value: "Instructions-for-use booklets, cartons, sterile-barrier labels",
    enumValue: "FDA_DEVICE",
    dedupeMode: "name",
    relevance: "fda-device",
    defaultEnabled: true,
    badgeClass: "bg-chart-2/10 text-chart-2",
    outreachAngle:
      "Their medical device just cleared FDA 510(k) — they now need instructions-for-use booklets, cartons and sterile-barrier labelling under document control. Emphasise regulated-market experience and revision control; tone is precise and B2B.",
  },
};

/** Derived, so it can never disagree with SOURCE_META. */
export const SOURCE_ENUM: Record<SourceId, ProspectSourceEnum> =
  Object.fromEntries(
    SOURCE_IDS.map((id) => [id, SOURCE_META[id].enumValue]),
  ) as Record<SourceId, ProspectSourceEnum>;

export function isSourceId(value: string): value is SourceId {
  return (SOURCE_IDS as readonly string[]).includes(value);
}

/**
 * Reverse lookup for rows read back from the DB, which carry the enum
 * rather than the id. Returns undefined for MANUAL (hand-entered leads
 * have no discovery agent) — callers must handle that.
 */
export function sourceMetaByEnum(
  value: ProspectSourceEnum,
): SourceMeta | undefined {
  return SOURCE_IDS.map((id) => SOURCE_META[id]).find(
    (meta) => meta.enumValue === value,
  );
}
