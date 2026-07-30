/**
 * Enrichment gate — pure. Three conditions, all required: relevance
 * passed, score over the floor, and budget remaining. A relevance/score
 * failure is SKIPPED (never enrich); budget exhaustion is PENDING (the
 * next run picks it up). See docs/prospecting.md §5.
 */

export type GateInput = {
  relevant: boolean;
  score: number;
  minScore: number;
  enrichedThisRun: number;
  maxPerRun: number;
};

export type GateVerdict = "ENRICH" | "SKIPPED" | "PENDING";

export function enrichmentGate(input: GateInput): GateVerdict {
  if (!input.relevant) return "SKIPPED";
  if (input.score < input.minScore) return "SKIPPED";
  if (input.enrichedThisRun >= input.maxPerRun) return "PENDING";
  return "ENRICH";
}
