import { z } from "zod";
import { CURRENCIES } from "@/lib/format/money";
import { getDb } from "./client";

/**
 * Organization.settings access. `Organization` is a global model that
 * tenantDb refuses, so — like resolvePortalToken in lib/portal/auth.ts —
 * this is the ONE place prospecting config touches the raw client. Reads
 * are zod-validated; unknown/absent config degrades to safe defaults.
 */

export const generalConfigSchema = z
  .object({
    currency: z.enum(CURRENCIES).default("SEK"),
  })
  .default({ currency: "SEK" });

export type GeneralConfig = z.infer<typeof generalConfigSchema>;

export async function readGeneralConfig(orgId: string): Promise<GeneralConfig> {
  const org = await getDb().organization.findUnique({
    where: { id: orgId },
    select: { settings: true },
  });
  const raw =
    org?.settings && typeof org.settings === "object"
      ? (org.settings as Record<string, unknown>).general
      : undefined;
  const parsed = generalConfigSchema.safeParse(raw ?? undefined);
  return parsed.success ? parsed.data : generalConfigSchema.parse(undefined);
}

export async function writeGeneralConfig(
  orgId: string,
  config: GeneralConfig,
): Promise<void> {
  const org = await getDb().organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { settings: true },
  });
  const settings =
    org.settings && typeof org.settings === "object"
      ? (org.settings as Record<string, unknown>)
      : {};
  await getDb().organization.update({
    where: { id: orgId },
    data: {
      settings: JSON.parse(JSON.stringify({ ...settings, general: config })),
    },
  });
}

/**
 * Which discovery agents this org runs. Separate from the master
 * `enabled` switch: `enabled` turns prospecting off entirely, `sources`
 * picks the agents. Defaults mirror SOURCE_META.defaultEnabled — permit
 * stays off because its connector is still a stub.
 */
const SOURCE_TOGGLE_DEFAULTS = {
  fda: true,
  places: true,
  permit: false,
  osm: true,
  fda_device: true,
} as const;

export const sourceTogglesSchema = z
  .object({
    fda: z.boolean().default(true),
    places: z.boolean().default(true),
    permit: z.boolean().default(false),
    osm: z.boolean().default(true),
    fda_device: z.boolean().default(true),
  })
  .default(SOURCE_TOGGLE_DEFAULTS);

export type SourceToggles = z.infer<typeof sourceTogglesSchema>;

export const prospectingConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    sources: sourceTogglesSchema,
    market: z
      .object({
        country: z.string().default("SE"),
        city: z.string().default(""),
        center: z.object({ lat: z.number(), lng: z.number() }).optional(),
        radiusMeters: z.number().int().positive().optional(),
      })
      .optional(),
    placesQueries: z.array(z.string()).default([]),
    /** OSM tag selectors, e.g. "shop=bakery" (Overpass agent) */
    osmCategories: z
      .array(z.string())
      .default([
        "shop=bakery",
        "amenity=restaurant",
        "amenity=cafe",
        "shop=hairdresser",
        "shop=florist",
      ]),
    permitSource: z
      .object({
        url: z.string(),
        termsUrl: z.string(), // REQUIRED — makes ToS compliance structural
        recordIdField: z.string(),
        nameField: z.string(),
        addressFields: z.array(z.string()).default([]),
        dateField: z.string().optional(),
        dateFormat: z.string().optional(),
        categoryField: z.string().optional(),
      })
      .optional(),
    fda: z
      .object({
        enabled: z.boolean().default(true),
        dosageFormAllowlist: z.array(z.string()).default([]),
        applicationTypes: z.array(z.string()).default([]),
      })
      .default({
        enabled: true,
        dosageFormAllowlist: [],
        applicationTypes: [],
      }),
    scoreWeights: z.record(z.string(), z.number()).optional(),
    enrichment: z
      .object({
        minScore: z.number().int().min(0).max(100).default(60),
        maxPerRun: z.number().int().min(0).default(10),
      })
      .default({ minScore: 60, maxPerRun: 10 }),
  })
  .default({
    enabled: false,
    sources: SOURCE_TOGGLE_DEFAULTS,
    placesQueries: [],
    osmCategories: [],
    fda: { enabled: true, dosageFormAllowlist: [], applicationTypes: [] },
    enrichment: { minScore: 60, maxPerRun: 10 },
  });

export type ProspectingConfig = z.infer<typeof prospectingConfigSchema>;

export async function readProspectingConfig(
  orgId: string,
): Promise<ProspectingConfig> {
  const org = await getDb().organization.findUnique({
    where: { id: orgId },
    select: { settings: true },
  });
  const raw =
    org?.settings && typeof org.settings === "object"
      ? (org.settings as Record<string, unknown>).prospecting
      : undefined;
  const parsed = prospectingConfigSchema.safeParse(raw ?? undefined);
  return parsed.success
    ? parsed.data
    : prospectingConfigSchema.parse(undefined);
}

export async function writeProspectingConfig(
  orgId: string,
  config: ProspectingConfig,
): Promise<void> {
  const org = await getDb().organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { settings: true },
  });
  const settings =
    org.settings && typeof org.settings === "object"
      ? (org.settings as Record<string, unknown>)
      : {};
  await getDb().organization.update({
    where: { id: orgId },
    data: {
      settings: JSON.parse(
        JSON.stringify({ ...settings, prospecting: config }),
      ),
    },
  });
}
