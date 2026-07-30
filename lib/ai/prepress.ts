import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { PrepressResult } from "@/lib/prepress/checks";
import { AI_MAX_TOKENS, AI_MODEL, getAiClient, isAiEnabled } from "./client";
import { runAiTask } from "./task";

/**
 * Plain-English prepress explanations — the deterministic checks
 * (lib/prepress/checks.ts) find the problems; Claude translates them
 * into a message a customer with no print background can act on. The
 * verdicts themselves are never AI-generated.
 */

const explanationSchema = z.object({
  summary: z.string(),
  customerMessage: z.string(),
  fixes: z.array(z.string()),
});

export type PrepressExplanation = z.infer<typeof explanationSchema>;

export type ExplainPrepressInput = {
  orgId: string;
  fileName: string;
  jobTitle: string;
  result: PrepressResult;
};

export async function explainPrepress(
  input: ExplainPrepressInput,
): Promise<PrepressExplanation | null> {
  if (!isAiEnabled()) return null;

  return runAiTask({
    orgId: input.orgId,
    kind: "PREPRESS_EXPLANATION",
    input: { fileName: input.fileName, verdict: input.result.verdict },
    fn: async () => {
      const client = getAiClient();
      const message = await client.messages.parse({
        model: AI_MODEL,
        max_tokens: AI_MAX_TOKENS,
        output_config: {
          effort: "low",
          format: zodOutputFormat(explanationSchema),
        },
        messages: [
          {
            role: "user",
            content: `A print shop ran automated prepress checks on the customer file "${input.fileName}" for the job "${input.jobTitle}". Translate the results for a customer with NO print background. The check results are authoritative — explain them, never contradict or soften a fail.

Checks (JSON): ${JSON.stringify(input.result.checks)}
Overall verdict: ${input.result.verdict}

Return:
- summary: 1–2 sentences for the shop's internal notes.
- customerMessage: a short, friendly email-ready paragraph telling the customer what's wrong (or that everything passed) in everyday language — no jargon like "trim box" without a plain-word gloss.
- fixes: one concrete step per problem the customer can do in their design tool (empty array if everything passed).`,
          },
        ],
      });

      if (message.stop_reason === "refusal") {
        throw new Error("Model refused the prepress explanation");
      }
      const parsed = message.parsed_output;
      if (!parsed) {
        throw new Error("No structured output returned");
      }

      return {
        output: parsed,
        usage: {
          model: message.model,
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
        },
      };
    },
  });
}
