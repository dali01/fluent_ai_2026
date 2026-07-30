import { Lightbulb } from "lucide-react";
import {
  InsightRow,
  type InsightRowData,
} from "@/components/insights/insight-row";
import { RecomputeButton } from "@/components/insights/recompute-button";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";

export const metadata = { title: "Insights" };

const THRESHOLD = 0.4;

export default async function InsightsPage() {
  const { orgId } = await requireOrg();
  const db = tenantDb(orgId);

  const scores = await db.leadScore.findMany({
    where: { company: { deletedAt: null } },
    include: { company: { select: { id: true, name: true } } },
    orderBy: { computedAt: "desc" },
    take: 500,
  });

  const toRow = (
    s: (typeof scores)[number],
    focus: "reorder" | "churn",
    value: number,
  ): InsightRowData => ({
    companyId: s.company.id,
    companyName: s.company.name,
    focus,
    score: Math.round(value * 100),
    rationale: s.rationale ?? "",
    computedAt: s.computedAt.toISOString(),
  });

  const reorderDue = scores
    .filter((s) => (s.reorderLikelihood ?? 0) >= THRESHOLD)
    .sort((a, b) => (b.reorderLikelihood ?? 0) - (a.reorderLikelihood ?? 0))
    .map((s) => toRow(s, "reorder", s.reorderLikelihood ?? 0));

  const churnRisk = scores
    .filter((s) => (s.churnRisk ?? 0) >= THRESHOLD)
    .sort((a, b) => (b.churnRisk ?? 0) - (a.churnRisk ?? 0))
    .map((s) => toRow(s, "churn", s.churnRisk ?? 0));

  const lastComputed = scores[0]?.computedAt ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>
          <p className="text-sm text-muted-foreground">
            Deterministic scores from order history — recomputed nightly.
            {lastComputed
              ? ` Last computed ${lastComputed.toLocaleString("sv-SE")}.`
              : ""}
          </p>
        </div>
        <RecomputeButton />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold">
          Due to reorder ({reorderDue.length})
        </h2>
        {reorderDue.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No customers look due right now.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {reorderDue.map((row) => (
              <InsightRow key={`r-${row.companyId}`} insight={row} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold">
          Churn risk ({churnRisk.length})
        </h2>
        {churnRisk.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No customers drifting away.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {churnRisk.map((row) => (
              <InsightRow key={`c-${row.companyId}`} insight={row} />
            ))}
          </div>
        )}
      </section>

      {scores.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-muted-foreground">
          <Lightbulb className="size-8" aria-hidden />
          <p>No scores yet — hit Recompute or wait for the nightly cron.</p>
        </div>
      ) : null}
    </div>
  );
}
