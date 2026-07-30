import type { DiscoveredProspect } from "./sources/types";
import { isLikelySameName, locationKey, nameKey } from "./normalize";

/**
 * Dedupe classification — pure, no Prisma import. The caller loads a
 * narrow index of existing rows (WITHOUT filtering deletedAt — rejected
 * prospects must keep suppressing re-ingestion, docs/prospecting.md §1a)
 * and this module decides per prospect. Duplicates are never written;
 * they only increment SourceRun.duplicates.
 */

export type DedupeIndex = {
  /** existing Lead.externalId values for the same (org, source) */
  externalIds: Set<string>;
  /** existing Lead.locationKey values (local sources) */
  locationKeys: Set<string>;
  /** existing Lead.normalizedName token-set keys */
  leadNameKeys: Set<string>;
  /** existing Company names (deletedAt: null) for the FDA customer match */
  companyNames: string[];
};

export type Verdict =
  | { kind: "new" }
  | { kind: "duplicate"; reason: "external-id" | "location" | "name" }
  | { kind: "existing-customer"; companyName: string };

/**
 * mode "location" (Places, permits): identity is place + address. Name
 * alone is never sufficient — two "Nordic Bakery" branches are two
 * prospects.
 *
 * mode "name" (FDA): identity is the sponsor name alone; location is
 * never consulted. A confident match against an existing Company is
 * surfaced as existing-customer (warm upsell, not a cold lead).
 */
export function classify(
  prospect: DiscoveredProspect,
  index: DedupeIndex,
  mode: "location" | "name",
): Verdict {
  if (index.externalIds.has(prospect.externalId)) {
    return { kind: "duplicate", reason: "external-id" };
  }

  if (mode === "location") {
    const key = locationKey(
      prospect.name,
      prospect.address?.line1,
      prospect.address?.postalCode,
    );
    if (key && index.locationKeys.has(key)) {
      return { kind: "duplicate", reason: "location" };
    }
    return { kind: "new" };
  }

  // mode === "name" (FDA)
  const key = nameKey(prospect.name);
  if (key && index.leadNameKeys.has(key)) {
    return { kind: "duplicate", reason: "name" };
  }
  for (const companyName of index.companyNames) {
    if (isLikelySameName(prospect.name, companyName)) {
      return { kind: "existing-customer", companyName };
    }
  }
  return { kind: "new" };
}
