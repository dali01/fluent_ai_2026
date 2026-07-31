import { z } from "zod";
import { fetchJson } from "../http";
import type {
  DiscoveredProspect,
  ProspectSource,
  SourceContext,
  SourceResult,
} from "./types";

/**
 * Municipal permit / licence feeds — the real connector, driven entirely
 * by the per-org `permitSource` config (docs/prospecting.md §3), so a
 * new city is configuration rather than code. Two dialects cover most
 * open-data portals:
 *  - Socrata (SODA): data.austintexas.gov, data.cityofchicago.org, …
 *    `$where` / `$order` / `$limit`; X-App-Token optional.
 *  - ArcGIS FeatureServer: `where` / `outFields` / `f=json`.
 * Both are read-only GETs, no key required.
 *
 * A permit is the sharpest signal a printer can get — someone who just
 * got licensed needs signage, cards and menus in weeks — so the config
 * REQUIRES a termsUrl, making ToS review structural rather than optional.
 */

export type PermitFeedConfig = {
  url: string;
  termsUrl: string;
  recordIdField: string;
  nameField: string;
  addressFields: string[];
  dateField?: string;
  dateFormat?: string;
  categoryField?: string;
  /** Column names vary per portal (Austin uses original_city / original_zip) */
  cityField?: string;
  postalCodeField?: string;
};

const rowSchema = z.record(z.string(), z.unknown());

const socrataResponseSchema = z.array(z.unknown());
const arcgisResponseSchema = z
  .object({
    features: z
      .array(z.object({ attributes: z.unknown().optional() }).loose())
      .optional(),
  })
  .loose();

export function isArcGisUrl(url: string): boolean {
  return /\/(FeatureServer|MapServer)\//i.test(url);
}

/**
 * Open-data portals publish civil timestamps with NO timezone
 * ("2026-07-24T00:00:00.000"), which `new Date()` reads as *local* time
 * — so the same feed would yield different dates on a UTC+2 laptop and
 * on Vercel (UTC), shifting recency scores and the watermark by a day.
 * Interpret them as UTC, which is stable everywhere.
 */
export function parseFeedDate(value: string): Date | undefined {
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
  const date = new Date(hasZone || !value.includes("T") ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function str(row: Record<string, unknown>, field: string): string | undefined {
  const value = row[field];
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

/**
 * Pure parser — takes the raw feed payload plus the field mapping and
 * produces prospects. Rows missing an id or a business name are
 * dropped, never guessed at.
 */
export function parsePermitResponse(
  json: unknown,
  config: PermitFeedConfig,
): DiscoveredProspect[] {
  // Normalize both dialects to a flat array of records
  let rows: unknown[] = [];
  const asArray = socrataResponseSchema.safeParse(json);
  if (asArray.success) {
    rows = asArray.data;
  } else {
    const asArcGis = arcgisResponseSchema.safeParse(json);
    if (asArcGis.success && asArcGis.data.features) {
      rows = asArcGis.data.features.map((f) => f.attributes ?? {});
    }
  }

  const out: DiscoveredProspect[] = [];
  for (const raw of rows) {
    const parsed = rowSchema.safeParse(raw);
    if (!parsed.success) continue;
    const row = parsed.data;

    const externalId = str(row, config.recordIdField);
    const name = str(row, config.nameField);
    if (!externalId || !name) continue;

    const addressParts = config.addressFields
      .map((f) => str(row, f))
      .filter((v): v is string => Boolean(v));
    const dateValue = config.dateField ? str(row, config.dateField) : undefined;
    const triggeredAt = dateValue ? parseFeedDate(dateValue) : undefined;

    out.push({
      externalId,
      name,
      triggerReason: `New permit / licence${
        config.categoryField && str(row, config.categoryField)
          ? ` — ${str(row, config.categoryField)}`
          : ""
      }`,
      category: config.categoryField
        ? str(row, config.categoryField)
        : undefined,
      triggeredAt,
      address: {
        line1: addressParts.length > 0 ? addressParts.join(" ") : undefined,
        // Configured field first; the fallbacks are conveniences, never
        // a substitute for mapping the feed properly.
        city: config.cityField
          ? str(row, config.cityField)
          : (str(row, "city") ?? str(row, "original_city")),
        postalCode: config.postalCodeField
          ? str(row, config.postalCodeField)
          : (str(row, "zip") ??
            str(row, "zipcode") ??
            str(row, "postal_code") ??
            str(row, "original_zip")),
        country: undefined,
      },
      raw: {
        permitId: externalId,
        category: config.categoryField
          ? str(row, config.categoryField)
          : undefined,
        feed: config.url,
        termsUrl: config.termsUrl,
      },
    });
  }
  return out;
}

/** First-run lookback: a permit feed goes back decades, and the oldest
 * rows are worthless as leads. Match the FDA connectors' 30-day default
 * so an unattended first run stays small and current. */
export const PERMIT_FIRST_RUN_DAYS = 30;

/**
 * Most feeds carry a date with no time, so a `> cursor` filter would
 * skip permits added later on the cursor's own day. Re-poll one day of
 * overlap every run — dedupe makes re-observation free, and the
 * alternative is silently losing same-day records.
 */
export const PERMIT_OVERLAP_DAYS = 1;

export function buildPermitUrl(
  config: PermitFeedConfig,
  since: string | undefined,
  limit: number,
  now: Date = new Date(),
): string {
  const fromDate = since
    ? new Date(
        new Date(`${since}Z`).getTime() - PERMIT_OVERLAP_DAYS * 86_400_000,
      )
    : new Date(now.getTime() - PERMIT_FIRST_RUN_DAYS * 86_400_000);
  const from = fromDate.toISOString().slice(0, 19);
  const url = new URL(config.url);
  if (isArcGisUrl(config.url)) {
    url.searchParams.set("f", "json");
    url.searchParams.set("outFields", "*");
    url.searchParams.set(
      "where",
      config.dateField ? `${config.dateField} > DATE '${from}'` : "1=1",
    );
    url.searchParams.set("resultRecordCount", String(limit));
    if (config.dateField) {
      url.searchParams.set("orderByFields", `${config.dateField} ASC`);
    }
    return url.toString();
  }

  // Socrata
  url.searchParams.set("$limit", String(limit));
  if (config.dateField) {
    url.searchParams.set("$order", `${config.dateField} ASC`);
    url.searchParams.set("$where", `${config.dateField} > '${from}'`);
  }
  return url.toString();
}

export function createPermitSource(
  config: PermitFeedConfig | undefined,
): ProspectSource {
  return {
    id: "permit",
    label: "Permits & licences",

    isConfigured() {
      return this.unavailableReason() === undefined;
    },

    unavailableReason() {
      if (!config) {
        return "no permit feed configured for this organization — add one under Settings → Prospecting";
      }
      if (!config.termsUrl) {
        return "the permit feed has no termsUrl — required before we query a third-party portal";
      }
      return undefined;
    },

    async fetchBatch(ctx: SourceContext): Promise<SourceResult> {
      const feed = config!;
      const warnings: string[] = [];
      const url = buildPermitUrl(feed, ctx.since, ctx.limit);

      const headers: Record<string, string> = {};
      // Optional everywhere — it only raises Socrata's per-IP rate limit
      if (process.env.SOCRATA_APP_TOKEN) {
        headers["X-App-Token"] = process.env.SOCRATA_APP_TOKEN;
      }

      const json = await fetchJson(url, { headers, signal: ctx.signal });
      const prospects = parsePermitResponse(json, feed);
      const truncated = prospects.length >= ctx.limit;
      if (truncated) {
        warnings.push(`hit run cap ${ctx.limit}; window will re-poll`);
      }

      // Watermark = the newest date we actually saw, so the next run
      // resumes exactly where this one stopped.
      const newest = prospects
        .map((p) => p.triggeredAt)
        .filter((d): d is Date => d instanceof Date)
        .sort((a, b) => b.getTime() - a.getTime())[0];

      return {
        prospects: prospects.slice(0, ctx.limit),
        cursor:
          !truncated && newest ? newest.toISOString().slice(0, 19) : undefined,
        shared: false, // per-org feed
        warnings,
        truncated,
      };
    },
  };
}
