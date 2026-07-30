import Anthropic from "@anthropic-ai/sdk";

/**
 * Lazy Anthropic client singleton (getDb() style): `next build` succeeds
 * with no ANTHROPIC_API_KEY; jobs guard on isAiEnabled() and skip AI
 * steps offline.
 *
 * SDK-over-fetch is a deliberate deviation from the Resend no-SDK
 * precedent: messages.parse() + zodOutputFormat beat hand-rolled
 * structured-output plumbing (recorded in DECISIONS.md Phase 8).
 *
 * Opus 5 ground rules (docs/prospecting.md §7): thinking is on by
 * default and max_tokens caps thinking+text, so size it generously;
 * temperature/top_p/top_k/budget_tokens are removed (400); no assistant
 * prefill; depth via output_config.effort; check stop_reason ===
 * "refusal" before reading content.
 */

export const AI_MODEL = "claude-opus-5";
export const AI_MAX_TOKENS = 16_000;

/** $/MTok for cost accounting on AiTask rows. */
export const AI_INPUT_COST_PER_MTOK_CENTS = 500; // $5
export const AI_OUTPUT_COST_PER_MTOK_CENTS = 2500; // $25

const globalForAi = globalThis as unknown as { anthropic?: Anthropic };

export function isAiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function getAiClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  if (!globalForAi.anthropic) {
    globalForAi.anthropic = new Anthropic();
  }
  return globalForAi.anthropic;
}
