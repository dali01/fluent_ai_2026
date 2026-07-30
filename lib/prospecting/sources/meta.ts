/**
 * Source identities + descriptions — a PURE module with no imports, so
 * client components can render the agent list without dragging fetch/
 * Prisma into the browser bundle (the lib/format vs lib/db lesson in
 * DECISIONS.md). The registry that constructs connectors lives in
 * ./index.ts; this is only what a human needs to see.
 */

export const SOURCE_IDS = ["fda", "places", "permit"] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

export const SOURCE_ENUM: Record<SourceId, "FDA" | "PLACES" | "PERMIT"> = {
  fda: "FDA",
  places: "PLACES",
  permit: "PERMIT",
};

export type SourceMeta = {
  id: SourceId;
  /** short label for chips and buttons */
  label: string;
  /** what the agent watches, in one line */
  watches: string;
  /** what a printer gets out of it */
  value: string;
  /** env var the connector needs, if any */
  requiresEnv?: string;
  /** true when the connector itself is not implemented yet */
  stub?: boolean;
  /** enabled by default for a new organization */
  defaultEnabled: boolean;
};

export const SOURCE_META: Record<SourceId, SourceMeta> = {
  fda: {
    id: "fda",
    label: "FDA approvals",
    watches: "openFDA drug application approvals",
    value:
      "Cartons, inserts, blister foil and pharmacy labels — weeks of runway",
    defaultEnabled: true,
  },
  places: {
    id: "places",
    label: "Places discovery",
    watches: "Google Places text search over your market queries",
    value: "Local businesses in your categories you have never quoted",
    requiresEnv: "GOOGLE_PLACES_API_KEY",
    defaultEnabled: true,
  },
  permit: {
    id: "permit",
    label: "Permits & licences",
    watches: "A configured business permit / licence feed",
    value: "Signage, cards, menus and window graphics, needed immediately",
    requiresEnv: "PERMIT_FEED_URL",
    stub: true,
    defaultEnabled: false,
  },
};

export function isSourceId(value: string): value is SourceId {
  return (SOURCE_IDS as readonly string[]).includes(value);
}
