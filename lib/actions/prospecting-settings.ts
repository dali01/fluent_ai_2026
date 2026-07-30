"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth/require-org";
import {
  prospectingConfigSchema,
  readProspectingConfig,
  writeProspectingConfig,
} from "@/lib/db/org-settings";
import { type ActionResult, actionOk, parseForm } from "./form";

const settingsFormSchema = z.object({
  enabled: z.boolean().default(false),
  source_fda: z.boolean().default(false),
  source_places: z.boolean().default(false),
  source_permit: z.boolean().default(false),
  city: z.string().trim().max(100).default(""),
  country: z.string().trim().max(2).toUpperCase().or(z.literal("")).default(""),
  /** one query per line */
  placesQueries: z.string().trim().max(4000).default(""),
  minScore: z.coerce.number().int().min(0).max(100).default(60),
  maxPerRun: z.coerce.number().int().min(0).max(100).default(10),
});

export async function saveProspectingSettings(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const { data, result } = parseForm(settingsFormSchema, formData, {
    booleans: ["enabled", "source_fda", "source_places", "source_permit"],
  });
  if (!data) return result!;

  const current = await readProspectingConfig(orgId);
  const next = {
    ...current,
    enabled: data.enabled,
    sources: {
      fda: data.source_fda,
      places: data.source_places,
      permit: data.source_permit,
    },
    market: {
      ...(current.market ?? { country: "SE", city: "" }),
      country: data.country || current.market?.country || "SE",
      city: data.city,
    },
    placesQueries: data.placesQueries
      .split("\n")
      .map((q) => q.trim())
      .filter(Boolean),
    enrichment: { minScore: data.minScore, maxPerRun: data.maxPerRun },
  };

  // Double validation (DECISIONS.md Phase 4 pattern): reparse the full
  // config before persisting.
  const parsed = prospectingConfigSchema.safeParse(next);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Config invalid: ${parsed.error.issues[0]?.message}`,
    };
  }
  await writeProspectingConfig(orgId, parsed.data);

  revalidatePath("/settings");
  revalidatePath("/prospects");
  return actionOk;
}
