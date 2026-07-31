import { tenantDb } from "@/lib/db/tenant";
import { LEAD_STAGES } from "@/lib/validation/crm";

/**
 * The weekly KPI pack — pure data assembly, no model call and no
 * judgement. Claude narrates this (lib/ai/briefing.ts); every number
 * here is countable from the database, so the briefing can never claim
 * something that isn't true (docs/ai-roadmap.md §1.2).
 */

export type OwnerBriefingData = {
  weekOf: string;
  pipeline: { stage: string; count: number; value: number }[];
  pipelineValue: number;
  dueThisWeek: { jobNumber: number; title: string; dueDate: string; rush: boolean }[];
  overdueJobs: number;
  overdueInvoices: { count: number; total: number };
  awaitingProof: number;
  lowStock: { name: string; onHand: number; threshold: number }[];
  reorderDue: { company: string; likelihood: number }[];
  churnRisk: { company: string; risk: number }[];
  newProspects: number;
  /** null when no job has completed with a due date to compare against */
  onTimeRate: number | null;
};

const DAY = 86_400_000;

export async function buildOwnerBriefing(
  orgId: string,
  now: Date = new Date(),
): Promise<OwnerBriefingData> {
  const db = tenantDb(orgId);
  const weekEnd = new Date(now.getTime() + 7 * DAY);
  const monthAgo = new Date(now.getTime() - 30 * DAY);

  const [leads, jobs, invoices, proofs, items, scores, prospects, completed] =
    await Promise.all([
      db.lead.findMany({
        where: {
          deletedAt: null,
          stage: { in: [...LEAD_STAGES], notIn: ["DELIVERED", "REPEAT"] },
        },
        select: { stage: true, value: true },
      }),
      db.job.findMany({
        where: { deletedAt: null, status: { not: "DONE" } },
        select: { jobNumber: true, title: true, dueDate: true, rush: true },
        orderBy: { dueDate: "asc" },
      }),
      db.invoice.findMany({
        where: { deletedAt: null, status: { in: ["SENT", "OVERDUE", "PARTIALLY_PAID"] } },
        select: { total: true, dueDate: true },
      }),
      db.proof.count({ where: { status: "SENT" } }),
      db.inventoryItem.findMany({
        where: { deletedAt: null },
        select: { name: true, quantityOnHand: true, reorderThreshold: true },
      }),
      db.leadScore.findMany({
        where: { company: { deletedAt: null } },
        include: { company: { select: { name: true } } },
      }),
      db.lead.count({
        where: { stage: "PROSPECT", discoveredAt: { gte: monthAgo } },
      }),
      db.job.findMany({
        where: { deletedAt: null, deliveredAt: { not: null, gte: monthAgo } },
        select: { dueDate: true, deliveredAt: true },
      }),
    ]);

  const pipeline = LEAD_STAGES.map((stage) => {
    const rows = leads.filter((l) => l.stage === stage);
    return {
      stage,
      count: rows.length,
      value: rows.reduce((sum, l) => sum + (l.value ? Number(l.value) : 0), 0),
    };
  }).filter((s) => s.count > 0);

  const overdueInvoiceRows = invoices.filter(
    (i) => i.dueDate && i.dueDate.getTime() < now.getTime(),
  );

  // On-time needs both a promise and an actual — jobs with no dueDate
  // are excluded rather than counted as successes.
  const comparable = completed.filter((j) => j.dueDate && j.deliveredAt);
  const onTime = comparable.filter(
    (j) => j.deliveredAt!.getTime() <= j.dueDate!.getTime(),
  ).length;

  return {
    weekOf: now.toISOString().slice(0, 10),
    pipeline,
    pipelineValue: pipeline.reduce((sum, s) => sum + s.value, 0),
    dueThisWeek: jobs
      .filter(
        (j) =>
          j.dueDate &&
          j.dueDate.getTime() >= now.getTime() &&
          j.dueDate.getTime() <= weekEnd.getTime(),
      )
      .map((j) => ({
        jobNumber: j.jobNumber,
        title: j.title,
        dueDate: j.dueDate!.toISOString().slice(0, 10),
        rush: j.rush,
      })),
    overdueJobs: jobs.filter(
      (j) => j.dueDate && j.dueDate.getTime() < now.getTime(),
    ).length,
    overdueInvoices: {
      count: overdueInvoiceRows.length,
      total: overdueInvoiceRows.reduce((sum, i) => sum + Number(i.total), 0),
    },
    awaitingProof: proofs,
    lowStock: items
      .filter(
        (i) => Number(i.quantityOnHand) <= Number(i.reorderThreshold),
      )
      .map((i) => ({
        name: i.name,
        onHand: Number(i.quantityOnHand),
        threshold: Number(i.reorderThreshold),
      })),
    reorderDue: scores
      .filter((s) => (s.reorderLikelihood ?? 0) >= 0.5)
      .sort((a, b) => (b.reorderLikelihood ?? 0) - (a.reorderLikelihood ?? 0))
      .slice(0, 5)
      .map((s) => ({
        company: s.company.name,
        likelihood: s.reorderLikelihood ?? 0,
      })),
    churnRisk: scores
      .filter((s) => (s.churnRisk ?? 0) >= 0.5)
      .sort((a, b) => (b.churnRisk ?? 0) - (a.churnRisk ?? 0))
      .slice(0, 5)
      .map((s) => ({ company: s.company.name, risk: s.churnRisk ?? 0 })),
    newProspects: prospects,
    onTimeRate:
      comparable.length > 0
        ? Math.round((onTime / comparable.length) * 100) / 100
        : null,
  };
}
