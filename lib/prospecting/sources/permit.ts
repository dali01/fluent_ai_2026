import type { ProspectSource, SourceContext, SourceResult } from "./types";

/**
 * Permit/licence connector — STUB, inert until a pilot source is
 * configured (per TODO-FUTURE.md's original wording: "real scraping of
 * business registrations/permits is future work"). The per-org
 * `permitSource` config (docs/prospecting.md §3) carries the feed URL,
 * field mapping and a REQUIRED termsUrl; the real parser lands when the
 * pilot market supplies its source.
 */
export const permitSource: ProspectSource = {
  id: "permit",
  label: "Business permits / licences (stub)",

  isConfigured() {
    // Inert until a pilot feed exists — SKIPPED, never FAILED.
    return Boolean(process.env.PERMIT_FEED_URL);
  },

  async fetchBatch(_ctx: SourceContext): Promise<SourceResult> {
    return {
      prospects: [],
      warnings: [
        "permit connector is a stub — configure permitSource in org settings and implement the pilot parser",
      ],
      truncated: false,
    };
  },
};
