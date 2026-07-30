import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ChurnInsight } from "@/lib/insights/churn";
import type { ReorderInsight } from "@/lib/insights/reorder";
import { AI_MAX_TOKENS, AI_MODEL, getAiClient, isAiEnabled } from "./client";
import { runAiTask } from "./task";

/**
 * Plain-English insight explanations — the deterministic scores from
 * lib/insights are the input, Claude turns them into something a sales
 * rep can act on. Claude explains; it never decides the numbers.
 */

const explanationSchema = z.object({
  explanation: z.string(),
  suggestedAction: z.string(),
  talkingPoint: z.string(),
});

export type InsightExplanation = z.infer<typeof explanationSchema>;

export type ExplainInsightInput = {
  orgId: string;
  companyName: string;
  focus: "reorder" | "churn";
  reorder?: ReorderInsight | null;
  churn?: ChurnInsight | null;
  recentOrders: Array<{ title: string; at: string }>;
};

export async function explainInsight(
  input: ExplainInsightInput,
): Promise<InsightExplanation | null> {
  if (!isAiEnabled()) return null;

  return runAiTask({
    orgId: input.orgId,
    kind: input.focus === "reorder" ? "REORDER_SCORING" : "CHURN_FLAGGING",
    input: { companyName: input.companyName, focus: input.focus },
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
            content: `You brief a print-shop sales rep about their customer "${input.companyName}". These numbers were computed deterministically from order history — explain them, do not second-guess or recompute them.

Focus: ${input.focus === "reorder" ? "they look due to reorder" : "they look at risk of churning"}.
${input.reorder ? `Reorder data: ${JSON.stringify(input.reorder)}` : "No reorder cadence (fewer than two orders)."}
${input.churn ? `Churn data: ${JSON.stringify(input.churn)}` : ""}
Recent orders: ${JSON.stringify(input.recentOrders)}

Write for the rep, not the customer:
- explanation: 2–3 sentences on what the numbers mean for THIS customer.
- suggestedAction: one concrete next step (who to call, what to offer).
- talkingPoint: one natural conversation opener referencing their actual order history — no invented facts.`,
          },
        ],
      });

      if (message.stop_reason === "refusal") {
        throw new Error("Model refused the insight explanation");
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
