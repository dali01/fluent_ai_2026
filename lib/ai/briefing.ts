import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { OwnerBriefingData } from "@/lib/insights/briefing";
import { AI_MAX_TOKENS, AI_MODEL, getAiClient, isAiEnabled } from "./client";
import { runAiTask } from "./task";

/**
 * Narrates the weekly KPI pack. Every number is supplied; Claude's job
 * is prioritisation and phrasing, not arithmetic (docs/ai-roadmap.md §1.2).
 */

const briefingSchema = z.object({
  headline: z.string().describe("One sentence: the week in a glance"),
  narrative: z.string().describe("3–5 sentences for the shop owner"),
  actions: z
    .array(z.string())
    .max(4)
    .describe("Concrete things to do this week, most urgent first"),
});

export type OwnerBriefing = z.infer<typeof briefingSchema>;

export async function narrateBriefing(
  orgId: string,
  orgName: string,
  data: OwnerBriefingData,
  currency: string,
): Promise<OwnerBriefing | null> {
  if (!isAiEnabled()) return null;

  return runAiTask({
    orgId,
    kind: "OWNER_BRIEFING",
    input: { weekOf: data.weekOf },
    fn: async () => {
      const client = getAiClient();
      const message = await client.messages.parse({
        model: AI_MODEL,
        max_tokens: AI_MAX_TOKENS,
        output_config: {
          effort: "low",
          format: zodOutputFormat(briefingSchema),
        },
        messages: [
          {
            role: "user",
            content: `Write the Monday briefing for ${orgName}, a print shop. These figures were computed from their database — they are authoritative. Do not recompute, extrapolate or invent any number, and do not mention a metric that is absent.

${JSON.stringify(data, null, 2)}

Vocabulary — keep these distinct, an owner reads them as different things:
- "pipeline" entries are LEADS/opportunities, not jobs. Never call them jobs.
- "dueThisWeek" and "overdueJobs" are production JOBS already sold.
- "onTimeRate" is null when no completed job had a due date to compare against — say nothing about punctuality in that case.

Amounts are in ${currency}. Write for an owner reading on their phone before opening up: lead with whatever actually needs attention (overdue money, jobs at risk, a customer drifting away), not with a list of everything. If the week looks quiet, say so plainly rather than manufacturing urgency.`,
          },
        ],
      });

      if (message.stop_reason === "refusal") {
        throw new Error("Model refused the briefing");
      }
      const parsed = message.parsed_output;
      if (!parsed) throw new Error("No structured output returned");

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
