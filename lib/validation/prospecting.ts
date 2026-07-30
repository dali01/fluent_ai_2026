import { z } from "zod";

export const PROSPECT_SOURCE_FILTERS = [
  "all",
  "FDA",
  "PLACES",
  "PERMIT",
] as const;

export const prospectFilterSchema = z.object({
  source: z.enum(PROSPECT_SOURCE_FILTERS).default("all"),
});

export const qualifyProspectSchema = z.object({
  companyName: z.string().trim().min(1, "Company name required").max(200),
});
