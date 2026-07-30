import { readProspectingConfig } from "@/lib/db/org-settings";
import { tenantDb } from "@/lib/db/tenant";
import { ingestBatch } from "./ingest";
import { getSource, type SourceId } from "./sources";
import type { SourceResult } from "./sources/types";

/**
 * One source run for one org: SourceRun RUNNING → fetch (with watermark)
 * → ingest → terminal status. Plain async function with no Request/
 * Response dependency — callable from the cron route AND the manual
 * "run now" server action identically. docs/prospecting.md §8.
 */

const SOURCE_ENUM: Record<SourceId, "FDA" | "PLACES" | "PERMIT"> = {
  fda: "FDA",
  places: "PLACES",
  permit: "PERMIT",
};

const MAX_PER_RUN = Number(process.env.PROSPECT_MAX_PER_RUN ?? "200");

export type RunSummary = {
  ok: boolean;
  status: "SUCCEEDED" | "PARTIAL" | "FAILED" | "SKIPPED";
  fetched: number;
  created: number;
  duplicates: number;
  screenedOut: number;
  enriched: number;
  error?: string;
};

export async function runProspectSource(
  orgId: string,
  sourceId: SourceId,
  options: { sharedResult?: SourceResult; now?: Date } = {},
): Promise<RunSummary & { sharedResult?: SourceResult }> {
  const now = options.now ?? new Date();
  const db = tenantDb(orgId);
  const sourceEnum = SOURCE_ENUM[sourceId];
  const config = await readProspectingConfig(orgId);

  const source = getSource(sourceId, {
    queries: config.placesQueries,
    center: config.market?.center,
    radiusMeters: config.market?.radiusMeters,
  });

  if (!config.enabled || !source.isConfigured()) {
    await db.sourceRun.create({
      data: {
        organizationId: orgId,
        source: sourceEnum,
        status: "SKIPPED",
        error: !config.enabled
          ? "prospecting disabled for org"
          : "source not configured",
        finishedAt: now,
      },
    });
    return {
      ok: true,
      status: "SKIPPED",
      fetched: 0,
      created: 0,
      duplicates: 0,
      screenedOut: 0,
      enriched: 0,
    };
  }

  const run = await db.sourceRun.create({
    data: { organizationId: orgId, source: sourceEnum, status: "RUNNING" },
  });

  try {
    // Watermark = cursor of the last successful run for this source
    const last = await db.sourceRun.findFirst({
      where: {
        source: sourceEnum,
        status: { in: ["SUCCEEDED", "PARTIAL"] },
        cursor: { not: null },
        id: { not: run.id },
      },
      orderBy: { startedAt: "desc" },
      select: { cursor: true },
    });

    // shared sources (openFDA): the caller fetches once and fans out
    const result =
      options.sharedResult ??
      (await source.fetchBatch({
        since: last?.cursor ?? undefined,
        limit: MAX_PER_RUN,
        signal: AbortSignal.timeout(120_000),
      }));

    const counters = await ingestBatch(
      orgId,
      sourceId,
      result.prospects,
      config,
      now,
    );

    const status = result.truncated ? "PARTIAL" : "SUCCEEDED";
    await db.sourceRun.update({
      where: { id: run.id },
      data: {
        status,
        cursor: result.cursor ?? last?.cursor ?? null,
        fetched: result.prospects.length,
        created: counters.created,
        duplicates: counters.duplicates,
        screenedOut: counters.screenedOut,
        enriched: counters.enriched,
        warnings:
          result.warnings.length > 0
            ? JSON.parse(JSON.stringify(result.warnings))
            : undefined,
        finishedAt: new Date(),
      },
    });
    await db.activityLog.create({
      data: {
        organizationId: orgId,
        type: "SYSTEM",
        summary: `Prospecting run (${source.label}): ${counters.created} new, ${counters.duplicates} duplicate, ${counters.screenedOut} screened out, ${counters.enriched} enriched`,
      },
    });

    return {
      ok: true,
      status,
      fetched: result.prospects.length,
      ...counters,
      sharedResult: result.shared ? result : undefined,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown pipeline error";
    await db.sourceRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        error: message.slice(0, 500),
        finishedAt: new Date(),
      },
    });
    await db.activityLog.create({
      data: {
        organizationId: orgId,
        type: "SYSTEM",
        summary: `Prospecting run (${source.label}) FAILED: ${message.slice(0, 120)}`,
      },
    });
    console.error(`[prospecting] ${sourceId} run failed for ${orgId}:`, error);
    return {
      ok: false,
      status: "FAILED",
      fetched: 0,
      created: 0,
      duplicates: 0,
      screenedOut: 0,
      enriched: 0,
      error: message,
    };
  }
}
