import { tenantDb } from "@/lib/db/tenant";
import {
  AI_INPUT_COST_PER_MTOK_CENTS,
  AI_OUTPUT_COST_PER_MTOK_CENTS,
} from "./client";

/**
 * runAiTask drives the AiTask model (PENDING → RUNNING → SUCCEEDED|
 * FAILED) around a Claude call, capturing model/tokens/cost from
 * response.usage — per-org AI spend reporting for free. First code to
 * write AiTask. Do NOT use AiTask as a generic job log (SourceRun is
 * the run log); a row here means a model was called.
 */

type AiTaskKind =
  | "LEAD_ENRICHMENT"
  | "REORDER_SCORING"
  | "CHURN_FLAGGING"
  | "OUTREACH_DRAFT"
  | "PREPRESS_EXPLANATION"
  | "BATCHING_SUGGESTION"
  | "TURNAROUND_ESTIMATE"
  | "WASTE_ESTIMATE"
  | "DEMAND_FORECAST"
  | "PORTAL_QUOTE_CHAT"
  | "RFQ_EXTRACTION";

export type AiUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
};

export function costCents(usage: AiUsage): number {
  return Math.round(
    (usage.inputTokens / 1_000_000) * AI_INPUT_COST_PER_MTOK_CENTS +
      (usage.outputTokens / 1_000_000) * AI_OUTPUT_COST_PER_MTOK_CENTS,
  );
}

export async function runAiTask<T>(options: {
  orgId: string;
  kind: AiTaskKind;
  input: Record<string, unknown>;
  fn: () => Promise<{ output: T; usage: AiUsage }>;
}): Promise<T> {
  const db = tenantDb(options.orgId);
  const task = await db.aiTask.create({
    data: {
      organizationId: options.orgId,
      kind: options.kind,
      status: "RUNNING",
      input: JSON.parse(JSON.stringify(options.input)),
      startedAt: new Date(),
    },
  });

  try {
    const { output, usage } = await options.fn();
    await db.aiTask.update({
      where: { id: task.id },
      data: {
        status: "SUCCEEDED",
        output: JSON.parse(JSON.stringify(output)),
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costCents: costCents(usage),
        finishedAt: new Date(),
      },
    });
    return output;
  } catch (error) {
    await db.aiTask.update({
      where: { id: task.id },
      data: {
        status: "FAILED",
        error:
          error instanceof Error
            ? error.message.slice(0, 500)
            : "unknown AI error",
        finishedAt: new Date(),
      },
    });
    throw error;
  }
}
