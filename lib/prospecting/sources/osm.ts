import { z } from "zod";
import { fetchJson } from "../http";
import type {
  DiscoveredProspect,
  ProspectSource,
  SourceContext,
  SourceResult,
} from "./types";

/**
 * OpenStreetMap via the Overpass API — keyless local discovery, and the
 * free alternative to Places. Two things matter for politeness
 * (Overpass is a donated public service):
 *  - a User-Agent identifying this app is REQUIRED by their policy,
 *  - stay far under "10,000 queries and 1 GB per day" — one query per
 *    configured category per run, capped by ctx.limit.
 * ODbL requires "© OpenStreetMap contributors" wherever the data is
 * shown; that string lives in SOURCE_META.attribution.
 *
 * `(newer:"<cursor>")` turns this from a coverage sweep into a real
 * trigger source: elements mapped since the last successful run. The
 * FIRST run has no cursor and deliberately does a one-off sweep of what
 * already exists nearby.
 */

/**
 * Overpass is a donated public service and its mirrors differ in load,
 * rate limiting and tolerance of datacenter traffic — the main instance
 * refused our Vercel egress outright ("fetch failed") while working
 * fine from a laptop. Try the mirrors in order rather than letting one
 * host's policy kill the agent.
 */
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const USER_AGENT = "FluentAI-CRM/1.0 (print-shop prospecting; +fluent-ai)";

/** Must stay under the serverless function budget, hence not 60s. */
const QUERY_TIMEOUT_SECONDS = 25;

const elementSchema = z
  .object({
    type: z.string(),
    id: z.number(),
    lat: z.number().optional(),
    lon: z.number().optional(),
    center: z.object({ lat: z.number(), lon: z.number() }).loose().optional(),
    timestamp: z.string().optional(),
    version: z.number().optional(),
    tags: z.record(z.string(), z.string()).optional(),
  })
  .loose();

const responseSchema = z
  .object({ elements: z.array(z.unknown()).optional() })
  .loose();

/** OSM tag → the category vocabulary CATEGORY_ALLOWLIST already speaks. */
function categoryOf(tags: Record<string, string>): string | undefined {
  return (
    tags.shop ??
    tags.amenity ??
    tags.office ??
    tags.craft ??
    tags.tourism ??
    tags.healthcare
  );
}

/** Pure parser — the unit-tested half. */
export function parseOverpassResponse(json: unknown): DiscoveredProspect[] {
  const parsed = responseSchema.safeParse(json);
  if (!parsed.success || !parsed.data.elements) return [];

  const out: DiscoveredProspect[] = [];
  for (const row of parsed.data.elements) {
    const element = elementSchema.safeParse(row);
    if (!element.success) continue;
    const e = element.data;
    const tags = e.tags ?? {};
    const name = tags.name?.trim();
    if (!name) continue; // unnamed POIs are useless as leads

    const category = categoryOf(tags);
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    const street = [tags["addr:street"], tags["addr:housenumber"]]
      .filter(Boolean)
      .join(" ");

    // version 1 means the element has never been edited — a genuinely
    // new mapping rather than an old business someone just corrected.
    const freshlyMapped = e.version === 1;

    out.push({
      externalId: `${e.type}/${e.id}`,
      name,
      triggerReason: freshlyMapped
        ? `Newly mapped on OpenStreetMap (${category ?? "business"})`
        : `Discovered on OpenStreetMap (${category ?? "business"})`,
      category,
      triggeredAt: e.timestamp ? new Date(e.timestamp) : undefined,
      address: {
        line1: street || undefined,
        city: tags["addr:city"] || undefined,
        postalCode: tags["addr:postcode"] || undefined,
        country: tags["addr:country"] || undefined,
      },
      website: tags.website ?? tags["contact:website"],
      phone: tags.phone ?? tags["contact:phone"],
      raw: {
        osmType: e.type,
        osmId: e.id,
        category,
        lat,
        lon,
        version: e.version,
        freshlyMapped,
        tags,
      },
    });
  }
  return out;
}

export type OsmConfig = {
  /** OSM tag selectors, e.g. "shop=bakery" or "amenity=restaurant" */
  categories: string[];
  center?: { lat: number; lng: number };
  radiusMeters?: number;
};

/** Only `key=value` or `key=*` — never interpolate raw config into QL. */
function tagSelector(category: string): string | null {
  const match = /^([a-z_:]+)=([A-Za-z0-9_:.\- *]+)$/.exec(category.trim());
  if (!match) return null;
  const [, key, value] = match;
  return value === "*" ? `["${key}"]` : `["${key}"="${value}"]`;
}

export function buildOverpassQuery(
  config: OsmConfig,
  since: string | undefined,
  limit: number,
): string {
  const radius = config.radiusMeters ?? 15_000;
  const { lat, lng } = config.center!;
  const newer = since ? `(newer:"${since}")` : "";
  const selectors = config.categories
    .map(tagSelector)
    .filter((s): s is string => s !== null)
    .map((s) => `  nwr${s}(around:${radius},${lat},${lng})${newer};`)
    .join("\n");

  return `[out:json][timeout:${QUERY_TIMEOUT_SECONDS}];\n(\n${selectors}\n);\nout center meta ${limit};`;
}

export function createOsmSource(config: OsmConfig): ProspectSource {
  return {
    id: "osm",
    label: "OpenStreetMap discovery",

    isConfigured() {
      return this.unavailableReason() === undefined;
    },

    unavailableReason() {
      if (!config.center) {
        return "no market centre set — add coordinates under Settings → Prospecting";
      }
      if (config.categories.length === 0) {
        return "no OSM categories configured — add them under Settings → Prospecting";
      }
      return undefined;
    },

    async fetchBatch(ctx: SourceContext): Promise<SourceResult> {
      const warnings: string[] = [];
      const rejected = config.categories.filter((c) => tagSelector(c) === null);
      if (rejected.length > 0) {
        warnings.push(`ignored malformed categories: ${rejected.join(", ")}`);
      }

      const query = buildOverpassQuery(config, ctx.since, ctx.limit);

      let json: unknown;
      let lastError: unknown;
      for (const endpoint of ENDPOINTS) {
        try {
          json = await fetchJson(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "text/plain",
              "User-Agent": USER_AGENT,
            },
            body: query,
            signal: ctx.signal,
            // Overpass queues under load; the mirror list is the real
            // retry strategy, so keep per-host attempts cheap.
            retries: 1,
            attemptTimeoutMs: (QUERY_TIMEOUT_SECONDS + 5) * 1000,
          });
          if (endpoint !== ENDPOINTS[0]) {
            warnings.push(`primary Overpass unavailable; used ${endpoint}`);
          }
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (json === undefined) {
        throw lastError instanceof Error
          ? new Error(`all Overpass mirrors failed: ${lastError.message}`)
          : new Error("all Overpass mirrors failed");
      }

      const prospects = parseOverpassResponse(json);
      const truncated = prospects.length >= ctx.limit;
      if (truncated) {
        warnings.push(`hit run cap ${ctx.limit} — narrow the category list`);
      }

      return {
        prospects: prospects.slice(0, ctx.limit),
        // Advance the watermark only on a complete sweep, so a truncated
        // run doesn't skip the elements it never saw.
        cursor: truncated ? undefined : new Date().toISOString(),
        shared: false, // per-org geography
        warnings,
        truncated,
      };
    },
  };
}
