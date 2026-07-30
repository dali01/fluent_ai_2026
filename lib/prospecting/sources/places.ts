import { z } from "zod";
import { fetchJson } from "../http";
import type {
  DiscoveredProspect,
  ProspectSource,
  SourceContext,
  SourceResult,
} from "./types";

/**
 * Google Places (New) Text Search connector. The X-Goog-FieldMask is
 * the billing lever — request ONLY what the pipeline uses. 20 results
 * per call is the hard cap; coverage comes from iterating the per-org
 * placesQueries list (category × sub-tile), bounded by the run cap.
 * ToS: place_id is storable indefinitely; cached content is refreshable
 * (purge job on TODO-FUTURE). docs/prospecting.md §8.
 */

const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.primaryType",
  "places.websiteUri",
  "places.nationalPhoneNumber",
].join(",");

const addressComponentSchema = z
  .object({
    longText: z.string().optional(),
    types: z.array(z.string()).optional(),
  })
  .loose();

const placeSchema = z
  .object({
    id: z.string(),
    displayName: z.object({ text: z.string() }).loose().optional(),
    formattedAddress: z.string().optional(),
    addressComponents: z.array(addressComponentSchema).optional(),
    primaryType: z.string().optional(),
    websiteUri: z.string().optional(),
    nationalPhoneNumber: z.string().optional(),
  })
  .loose();

const responseSchema = z
  .object({ places: z.array(z.unknown()).optional() })
  .loose();

function component(
  components: z.infer<typeof addressComponentSchema>[] | undefined,
  type: string,
): string | undefined {
  return components?.find((c) => c.types?.includes(type))?.longText;
}

/** Pure parser — the unit-tested half. */
export function parsePlacesResponse(json: unknown): DiscoveredProspect[] {
  const parsed = responseSchema.safeParse(json);
  if (!parsed.success || !parsed.data.places) return [];

  const out: DiscoveredProspect[] = [];
  for (const row of parsed.data.places) {
    const place = placeSchema.safeParse(row);
    if (!place.success) continue;
    const p = place.data;
    const name = p.displayName?.text?.trim();
    if (!name) continue;

    const streetNumber = component(p.addressComponents, "street_number");
    const route = component(p.addressComponents, "route");
    const line1 =
      [route, streetNumber].filter(Boolean).join(" ") ||
      p.formattedAddress?.split(",")[0];

    out.push({
      externalId: p.id,
      name,
      triggerReason: `Discovered via Places (${p.primaryType ?? "business"})`,
      category: p.primaryType,
      address: {
        line1: line1 || undefined,
        city:
          component(p.addressComponents, "postal_town") ??
          component(p.addressComponents, "locality"),
        postalCode: component(p.addressComponents, "postal_code"),
        country: component(p.addressComponents, "country"),
      },
      website: p.websiteUri,
      phone: p.nationalPhoneNumber,
      raw: {
        placeId: p.id,
        primaryType: p.primaryType,
        formattedAddress: p.formattedAddress,
      },
    });
  }
  return out;
}

export type PlacesQueryConfig = {
  queries: string[];
  center?: { lat: number; lng: number };
  radiusMeters?: number;
};

export function createPlacesSource(config: PlacesQueryConfig): ProspectSource {
  return {
    id: "places",
    label: "Google Places discovery",

    isConfigured() {
      return this.unavailableReason() === undefined;
    },

    unavailableReason() {
      if (!process.env.GOOGLE_PLACES_API_KEY) {
        return "GOOGLE_PLACES_API_KEY is not set on this deployment";
      }
      if (config.queries.length === 0) {
        return "no Places queries configured — add them under Settings → Prospecting";
      }
      return undefined;
    },

    async fetchBatch(ctx: SourceContext): Promise<SourceResult> {
      const apiKey = process.env.GOOGLE_PLACES_API_KEY!;
      const prospects: DiscoveredProspect[] = [];
      const warnings: string[] = [];
      let truncated = false;

      for (const query of config.queries) {
        if (prospects.length >= ctx.limit) {
          truncated = true;
          warnings.push(`hit run cap ${ctx.limit} before finishing queries`);
          break;
        }
        const body: Record<string, unknown> = { textQuery: query };
        if (config.center && config.radiusMeters) {
          body.locationBias = {
            circle: {
              center: {
                latitude: config.center.lat,
                longitude: config.center.lng,
              },
              radius: config.radiusMeters,
            },
          };
        }

        const json = await fetchJson(
          "https://places.googleapis.com/v1/places:searchText",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": apiKey,
              "X-Goog-FieldMask": FIELD_MASK,
            },
            body: JSON.stringify(body),
            signal: ctx.signal,
          },
        );
        prospects.push(...parsePlacesResponse(json));
      }

      return {
        prospects: prospects.slice(0, ctx.limit),
        // Places has no delta cursor — every run is a fresh sweep; dedupe
        // by place_id makes re-observation free.
        shared: false,
        warnings,
        truncated,
      };
    },
  };
}
