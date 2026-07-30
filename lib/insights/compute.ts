import { tenantDb } from "@/lib/db/tenant";
import { scoreChurn } from "./churn";
import { scoreReorder, type OrderEvent } from "./reorder";

/**
 * Recompute LeadScore for every company in an org — deterministic,
 * idempotent, one upsert per company with order history. An order event
 * is a non-deleted Job's creation date (the moment the customer bought).
 * Companies that never ordered get no row: nothing to score.
 */

export type InsightsRunSummary = {
  companies: number;
  scored: number;
};

export async function computeLeadScores(
  orgId: string,
  now: Date = new Date(),
): Promise<InsightsRunSummary> {
  const db = tenantDb(orgId);

  const companies = await db.company.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      jobs: {
        where: { deletedAt: null },
        select: { createdAt: true, title: true, quantity: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  let scored = 0;
  for (const company of companies) {
    const orders: OrderEvent[] = company.jobs.map((j) => ({
      at: j.createdAt,
      title: j.title,
      quantity: j.quantity,
    }));

    const reorder = scoreReorder(orders, now);
    const churn = scoreChurn(orders, now, reorder?.medianIntervalDays);
    if (!churn) continue; // no orders — nothing to score

    const rationale = [reorder?.rationale, churn.rationale]
      .filter(Boolean)
      .join(" ");

    await db.leadScore.upsert({
      where: {
        organizationId_companyId: {
          organizationId: orgId,
          companyId: company.id,
        },
      },
      create: {
        organizationId: orgId,
        companyId: company.id,
        reorderLikelihood: reorder?.likelihood ?? null,
        churnRisk: churn.risk,
        rationale,
        enrichment: JSON.parse(JSON.stringify({ reorder, churn })),
        computedAt: now,
      },
      update: {
        reorderLikelihood: reorder?.likelihood ?? null,
        churnRisk: churn.risk,
        rationale,
        enrichment: JSON.parse(JSON.stringify({ reorder, churn })),
        computedAt: now,
      },
    });
    scored++;
  }

  return { companies: companies.length, scored };
}
