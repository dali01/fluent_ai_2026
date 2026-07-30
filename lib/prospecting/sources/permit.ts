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
    const triggeredAt = dateValue ? new Date(dateValue) : undefined;

    out.push({
      externalId,
      name,
      triggerReason: `New permit / licence${
        config.categoryField && str(row, config.categoryField)
          ? ` — ${str(row, config.categoryField)}`
          : ""
      }`,
      category: config.categoryField ? str(row, config.categoryField) : undefined,
      triggeredAt:
        triggeredAt && !Number.isNaN(triggeredAt.getTime())
          ? triggeredAt
          : undefined,
      address: {
        line1: addressParts.length > 0 ? addressParts.join(" ") : undefined,
        city: str(row, "city") ?? str(row, "City"),
        postalCode:
          str(row, "zip") ?? str(row, "zipcode") ?? str(row, "postal_code"),
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

export function buildPermitUrl(
  config: PermitFeedConfig,
  since: string | undefined,
  limit: number,
): string {
  const url = new URL(config.url);
  if (isArcGisUrl(config.url)) {
    url.searchParams.set("f", "json");
    url.searchParams.set("outFields", "*");
    url.searchParams.set(
      "where",
      config.dateField && since
        ? `${config.dateField} > DATE '${since}'`
        : "1=1",
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
    if (since) {
      url.searchParams.set("$where", `${config.dateField} > '${since}'`);
    }
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
          !truncated && newest
            ? newest.toISOString().slice(0, 19)
            : undefined,
        shared: false, // per-org feed
        warnings,
        truncated,
      };
    },
  };
}
