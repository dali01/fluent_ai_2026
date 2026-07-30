import { tenantDb } from "@/lib/db/tenant";
import type { ProspectingConfig } from "@/lib/db/org-settings";
import { classify, type DedupeIndex } from "./dedupe";
import { enrichSafe } from "./enrichment";
import { enrichmentGate } from "./gate";
import { locationKey, nameKey, normalizeBusinessName } from "./normalize";
import { isRelevantFda, isRelevantLocal } from "./relevance";
import { scoreProspect, type ProspectSourceKind } from "./scoring";
import type { DiscoveredProspect } from "./sources/types";

/**
 * Ingest a batch of discovered prospects for one org: dedupe →
 * relevance → score → gate → enrich → write. Duplicates are never
 * written; per-prospect failures never lose the batch.
 * docs/prospecting.md §4–6.
 */

export type IngestCounters = {
  created: number;
  duplicates: number;
  screenedOut: number;
  enriched: number;
};

const SOURCE_TO_ENUM: Record<string, ProspectSourceKind> = {
  fda: "FDA",
  places: "PLACES",
  permit: "PERMIT",
};

async function loadDedupeIndex(
  orgId: string,
  source: ProspectSourceKind,
): Promise<DedupeIndex> {
  const db = tenantDb(orgId);
  // Deliberately NOT filtering deletedAt — rejected/archived prospects
  // must keep suppressing re-ingestion (docs/prospecting.md §1a).
  const [leads, companies] = await Promise.all([
    db.lead.findMany({
      where: { prospectSource: source },
      select: { externalId: true, locationKey: true, normalizedName: true },
    }),
    db.company.findMany({
      where: { deletedAt: null },
      select: { name: true },
    }),
  ]);

  return {
    externalIds: new Set(
      leads.map((l) => l.externalId).filter((x): x is string => Boolean(x)),
    ),
    locationKeys: new Set(
      leads.map((l) => l.locationKey).filter((x): x is string => Boolean(x)),
    ),
    leadNameKeys: new Set(
      leads
        .map((l) => (l.normalizedName ? nameKey(l.normalizedName) : null))
        .filter((x): x is string => Boolean(x)),
    ),
    companyNames: companies.map((c) => c.name),
  };
}

export async function ingestBatch(
  orgId: string,
  sourceId: string,
  prospects: DiscoveredProspect[],
  config: ProspectingConfig,
  now: Date,
): Promise<IngestCounters> {
  const source = SOURCE_TO_ENUM[sourceId] ?? "MANUAL";
  const mode = source === "FDA" ? "name" : "location";
  const db = tenantDb(orgId);
  const index = await loadDedupeIndex(orgId, source);
  const counters: IngestCounters = {
    created: 0,
    duplicates: 0,
    screenedOut: 0,
    enriched: 0,
  };

  for (const prospect of prospects) {
    try {
      const verdict = classify(prospect, index, mode);
      if (verdict.kind === "duplicate") {
        counters.duplicates++;
        continue;
      }

      // Relevance
      const relevance =
        source === "FDA"
          ? isRelevantFda({
              dosageForm: prospect.raw.dosageForm as string | undefined,
              marketingStatus: prospect.raw.marketingStatus as
                string | undefined,
              submissionType: prospect.raw.submissionType as string | undefined,
            })
          : isRelevantLocal(prospect);

      const existingCustomer = verdict.kind === "existing-customer";
      if (!relevance.relevant && !existingCustomer) {
        counters.screenedOut++;
        continue;
      }

      // Score (deterministic)
      const scored = scoreProspect({
        source,
        triggeredAt: prospect.triggeredAt,
        now,
        categoryFit: relevance.relevant ? 1 : 0,
        repeatSignal:
          source === "FDA" && prospect.raw.isOriginal === true ? 1 : 0.3,
        existingCustomer,
        weights: config.scoreWeights,
      });

      // Existing customer: record as screened-out upsell signal on the log
      if (existingCustomer) {
        await db.activityLog.create({
          data: {
            organizationId: orgId,
            type: "SYSTEM",
            summary: `Prospecting signal for existing customer ${verdict.companyName}: ${prospect.triggerReason}`,
          },
        });
        counters.screenedOut++;
        continue;
      }

      // Enrichment gate
      const gate = enrichmentGate({
        relevant: relevance.relevant,
        score: scored.score,
        minScore: config.enrichment.minScore,
        enrichedThisRun: counters.enriched,
        maxPerRun: config.enrichment.maxPerRun,
      });

      let enriched = null;
      if (gate === "ENRICH") {
        enriched = await enrichSafe({
          companyName: prospect.name,
          website: prospect.website,
          city: prospect.address?.city,
          country: prospect.address?.country,
        });
        if (enriched) counters.enriched++;
      }

      await db.lead.create({
        data: {
          organizationId: orgId,
          title: prospect.triggerReason,
          stage: "PROSPECT",
          prospectSource: source,
          triggerReason: prospect.triggerReason,
          category: prospect.category ?? null,
          externalId: prospect.externalId,
          normalizedName: normalizeBusinessName(prospect.name),
          locationKey: locationKey(
            prospect.name,
            prospect.address?.line1,
            prospect.address?.postalCode,
          ),
          addressLine1: prospect.address?.line1 ?? null,
          city: prospect.address?.city ?? null,
          postalCode: prospect.address?.postalCode ?? null,
          country: prospect.address?.country ?? null,
          website: prospect.website ?? null,
          phone: prospect.phone ?? null,
          notes: prospect.name, // human-readable business name
          contactName: enriched?.name ?? null,
          contactEmail: enriched?.email ?? null,
          contactPhone: enriched?.phone ?? null,
          contactTitle: enriched?.title ?? null,
          enrichmentStatus:
            gate === "ENRICH"
              ? enriched
                ? "ENRICHED"
                : "FAILED"
              : gate === "PENDING"
                ? "PENDING"
                : "SKIPPED",
          enrichmentProvider: enriched?.provider ?? null,
          enrichedAt: enriched ? now : null,
          score: scored.score,
          scoreBreakdown: JSON.parse(JSON.stringify(scored.factors)),
          rationale: scored.rationale,
          signal: JSON.parse(JSON.stringify(prospect.raw)),
          triggeredAt: prospect.triggeredAt ?? null,
          discoveredAt: now,
        },
      });
      counters.created++;

      // Keep the in-memory index current within the batch
      index.externalIds.add(prospect.externalId);
      const lk = locationKey(
        prospect.name,
        prospect.address?.line1,
        prospect.address?.postalCode,
      );
      if (lk) index.locationKeys.add(lk);
      index.leadNameKeys.add(nameKey(prospect.name));
    } catch (error) {
      // Unique-constraint race (double-fired cron) counts as duplicate;
      // anything else is logged and the batch survives.
      if (
        error instanceof Error &&
        "code" in error &&
        (error as { code: string }).code === "P2002"
      ) {
        counters.duplicates++;
      } else {
        console.error(
          `[prospecting] ingest failed for ${prospect.externalId}:`,
          error,
        );
      }
    }
  }

  return counters;
}
