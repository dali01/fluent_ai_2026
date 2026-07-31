"use server";

import { revalidatePath } from "next/cache";
import { isAiEnabled } from "@/lib/ai/client";
import { explainInsight, type InsightExplanation } from "@/lib/ai/insights";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";
import type { ChurnInsight } from "@/lib/insights/churn";
import { computeLeadScores } from "@/lib/insights/compute";
import type { ReorderInsight } from "@/lib/insights/reorder";
import { type ActionResult, actionOk } from "./form";

/** Manual recompute — calls the SAME function the nightly cron calls. */
export async function recomputeInsightsNow(): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  await computeLeadScores(orgId);
  revalidatePath("/insights");
  return actionOk;
}

export async function explainCompanyInsight(
  companyId: string,
  focus: "reorder" | "churn",
): Promise<
  { ok: true; explanation: InsightExplanation } | { ok: false; error: string }
> {
  const { orgId } = await requireOrg();
  if (!isAiEnabled()) {
    return { ok: false, error: "AI is not configured (ANTHROPIC_API_KEY)" };
  }
  const db = tenantDb(orgId);

  const score = await db.leadScore.findUniqueOrThrow({
    where: {
      organizationId_companyId: { organizationId: orgId, companyId },
    },
    include: { company: { select: { name: true } } },
  });
  const recentJobs = await db.job.findMany({
    where: { companyId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { title: true, createdAt: true },
  });

  const factors = (score.enrichment ?? {}) as {
    reorder?: ReorderInsight | null;
    churn?: ChurnInsight | null;
  };

  try {
    const explanation = await explainInsight({
      orgId,
      companyName: score.company.name,
      focus,
      reorder: factors.reorder ?? null,
      churn: factors.churn ?? null,
      recentOrders: recentJobs.map((j) => ({
        title: j.title,
        at: j.createdAt.toISOString().slice(0, 10),
      })),
    });
    if (!explanation) return { ok: false, error: "AI unavailable" };
    return { ok: true, explanation };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Explanation failed",
    };
  }
}
