/**
 * Insights smoke test — deterministic LeadScore compute against the
 * seeded local DB. No AI calls (the explanation layer is exercised in
 * the UI; this proves the scoring pipeline). Mirrors smoke-crm.ts.
 *
 *   pnpm exec tsx scripts/smoke-insights.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: [".env.local", ".env"] });

import { tenantDb } from "@/lib/db/tenant";
import { computeLeadScores } from "@/lib/insights/compute";

const ORG = process.env.SEED_ORG_ID ?? "org_demo_fluent";

async function main() {
  const db = tenantDb(ORG);
  const now = new Date();

  const first = await computeLeadScores(ORG, now);
  console.log(
    `compute: ${first.scored}/${first.companies} companies scored (expect ≥1 scored)`,
  );
  if (first.scored < 1) throw new Error("nothing scored — seed data missing?");

  // Idempotency: same now → identical scores, same row count
  const second = await computeLeadScores(ORG, now);
  if (second.scored !== first.scored) {
    throw new Error("recompute changed the scored count");
  }
  const scores = await db.leadScore.findMany({
    include: { company: { select: { name: true } } },
  });
  console.log(`leadScore rows: ${scores.length} (expect ${first.scored})`);

  for (const s of scores) {
    const factors = s.enrichment as { churn?: unknown } | null;
    if (s.churnRisk == null || !factors?.churn || !s.rationale) {
      throw new Error(`incomplete score for ${s.company.name}`);
    }
    console.log(
      `  ${s.company.name}: reorder=${s.reorderLikelihood ?? "—"} churn=${s.churnRisk} — ${s.rationale.slice(0, 80)}…`,
    );
  }

  // Cross-tenant probe (copied from smoke-crm)
  const foreign = tenantDb("org_someone_else");
  const foreignScores = await foreign.leadScore.findMany();
  console.log(`foreign org sees ${foreignScores.length} scores (expect 0)`);
  if (foreignScores.length !== 0) throw new Error("TENANT LEAK");

  console.log("SMOKE OK");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
