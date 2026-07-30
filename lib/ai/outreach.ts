import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AI_MAX_TOKENS, AI_MODEL, getAiClient, isAiEnabled } from "./client";
import { runAiTask } from "./task";

/**
 * AI-drafted outreach — Claude's ONE job in prospecting: turning the
 * deterministic trigger + score rationale into trigger-specific copy.
 * Drafted, never sent (copy-to-clipboard only; docs/prospecting.md §6).
 */

const outreachSchema = z.object({
  subject: z.string(),
  body: z.string(),
  followUpAngle: z.string(),
});

export type OutreachDraft = z.infer<typeof outreachSchema>;

export type OutreachInput = {
  orgId: string;
  shopName: string;
  prospectName: string;
  triggerReason: string;
  source: string; // FDA | PLACES | PERMIT
  category?: string | null;
  city?: string | null;
  rationale?: string | null;
};

const SOURCE_ANGLE: Record<string, string> = {
  FDA: "Their drug approval just cleared — they will need cartons, package inserts, blister foil and pharmacy labels with a compliance-grade print partner. Procurement runway is weeks, tone is B2B-professional.",
  PERMIT:
    "They JUST opened or licensed a new business — they need signage, business cards, menus and window graphics immediately. Tone is warm, local, congratulatory.",
  PLACES:
    "An established local business we have not worked with. Lead with one concrete idea for their category, not a generic pitch.",
};

export async function draftOutreach(
  input: OutreachInput,
): Promise<OutreachDraft | null> {
  if (!isAiEnabled()) return null;

  return runAiTask({
    orgId: input.orgId,
    kind: "OUTREACH_DRAFT",
    input: { prospectName: input.prospectName, source: input.source },
    fn: async () => {
      const client = getAiClient();
      const message = await client.messages.parse({
        model: AI_MODEL,
        max_tokens: AI_MAX_TOKENS,
        output_config: {
          effort: "low",
          format: zodOutputFormat(outreachSchema),
        },
        messages: [
          {
            role: "user",
            content: `You draft first-touch sales outreach for ${input.shopName}, a commercial print shop. Draft a short email (under 140 words) to ${input.prospectName}${input.city ? ` in ${input.city}` : ""}.

Trigger: ${input.triggerReason}
Angle: ${SOURCE_ANGLE[input.source] ?? SOURCE_ANGLE.PLACES}
${input.category ? `Their category: ${input.category}` : ""}
${input.rationale ? `Why they scored well: ${input.rationale}` : ""}

Rules: no placeholder brackets except {{contactName}}, no invented facts about them beyond the trigger, one clear call to action, Swedish-market-appropriate directness in English.`,
          },
        ],
      });

      if (message.stop_reason === "refusal") {
        throw new Error("Model refused the outreach draft");
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
