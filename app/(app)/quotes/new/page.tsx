import {
  type BuilderCompany,
  QuoteBuilder,
} from "@/components/quotes/quote-builder";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";
import type { EngineRule } from "@/lib/pricing/engine";

export const metadata = { title: "New quote" };

export default async function NewQuotePage() {
  const { orgId } = await requireOrg();
  const db = tenantDb(orgId);

  const [companies, rules] = await Promise.all([
    db.company.findMany({
      where: { deletedAt: null },
      include: { priceTier: true },
      orderBy: { name: "asc" },
    }),
    db.pricingRule.findMany({ where: { active: true } }),
  ]);

  const builderCompanies: BuilderCompany[] = companies.map((c) => ({
    id: c.id,
    name: c.name,
    tierName: c.priceTier?.name ?? null,
    tierMultiplier: c.priceTier ? Number(c.priceTier.multiplier) : 1,
  }));
  const engineRules: EngineRule[] = rules.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    config: r.config,
  }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">New quote</h1>
      <QuoteBuilder companies={builderCompanies} rules={engineRules} />
    </div>
  );
}
