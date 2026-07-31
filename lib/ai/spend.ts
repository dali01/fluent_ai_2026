import { tenantDb } from "@/lib/db/tenant";

/**
 * Per-org AI spend, read straight off AiTask. runAiTask has recorded
 * model, tokens and cost since Phase 8 — this just makes it visible
 * (docs/ai-roadmap.md §1.4). No estimation, no model call.
 */

export type SpendByKind = {
  kind: string;
  calls: number;
  failed: number;
  costCents: number;
  inputTokens: number;
  outputTokens: number;
};

export type SpendSummary = {
  sinceDays: number;
  totalCostCents: number;
  totalCalls: number;
  failedCalls: number;
  byKind: SpendByKind[];
};

export async function readAiSpend(
  orgId: string,
  sinceDays = 30,
  now: Date = new Date(),
): Promise<SpendSummary> {
  const since = new Date(now.getTime() - sinceDays * 86_400_000);
  const tasks = await tenantDb(orgId).aiTask.findMany({
    where: { createdAt: { gte: since } },
    select: {
      kind: true,
      status: true,
      costCents: true,
      inputTokens: true,
      outputTokens: true,
    },
  });

  const byKind = new Map<string, SpendByKind>();
  for (const task of tasks) {
    const row = byKind.get(task.kind) ?? {
      kind: task.kind,
      calls: 0,
      failed: 0,
      costCents: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    row.calls++;
    if (task.status === "FAILED") row.failed++;
    row.costCents += task.costCents ?? 0;
    row.inputTokens += task.inputTokens ?? 0;
    row.outputTokens += task.outputTokens ?? 0;
    byKind.set(task.kind, row);
  }

  const rows = [...byKind.values()].sort((a, b) => b.costCents - a.costCents);
  return {
    sinceDays,
    totalCostCents: rows.reduce((sum, r) => sum + r.costCents, 0),
    totalCalls: tasks.length,
    failedCalls: rows.reduce((sum, r) => sum + r.failed, 0),
    byKind: rows,
  };
}
