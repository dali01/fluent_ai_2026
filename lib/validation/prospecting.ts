import { z } from "zod";

export const PROSPECT_SOURCE_FILTERS = [
  "all",
  "FDA",
  "PLACES",
  "PERMIT",
  "OSM",
  "FDA_DEVICE",
] as const;

/** Filter values excluding "all" — used to validate ?source= */
export const PROSPECT_SOURCE_VALUES = PROSPECT_SOURCE_FILTERS.filter(
  (f): f is Exclude<(typeof PROSPECT_SOURCE_FILTERS)[number], "all"> =>
    f !== "all",
);

export const prospectFilterSchema = z.object({
  source: z.enum(PROSPECT_SOURCE_FILTERS).default("all"),
});

export const qualifyProspectSchema = z.object({
  companyName: z.string().trim().min(1, "Company name required").max(200),
});
