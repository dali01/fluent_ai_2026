import { notFound, redirect } from "next/navigation";
import {
  type BuilderCompany,
  QuoteBuilder,
} from "@/components/quotes/quote-builder";
import { requireOrg } from "@/lib/auth/require-org";
import { readGeneralConfig } from "@/lib/db/org-settings";
import { tenantDb } from "@/lib/db/tenant";
import type { EngineRule } from "@/lib/pricing/engine";

export const metadata = { title: "Edit quote" };

export default async function EditQuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { orgId } = await requireOrg();
  const { id } = await params;
  const db = tenantDb(orgId);

  const [quote, companies, rules] = await Promise.all([
    db.quote.findUnique({
      where: { id },
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    }),
    db.company.findMany({
      where: { deletedAt: null },
      include: { priceTier: true },
      orderBy: { name: "asc" },
    }),
    db.pricingRule.findMany({ where: { active: true } }),
  ]);
  if (!quote || quote.deletedAt) notFound();
  if (quote.status !== "DRAFT") redirect(`/quotes/${quote.id}`);

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
  const breakdown = quote.pricingBreakdown as { rush?: boolean } | null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Edit quote <span className="font-mono">#{quote.quoteNumber}</span>
      </h1>
      <QuoteBuilder
        quoteId={quote.id}
        companies={builderCompanies}
        rules={engineRules}
        currency={(await readGeneralConfig(orgId)).currency}
        initial={{
          companyId: quote.companyId,
          rush: breakdown?.rush ?? false,
          validUntil: quote.validUntil
            ? quote.validUntil.toISOString().slice(0, 10)
            : "",
          notes: quote.notes ?? "",
          lines: quote.lineItems.map((line) => {
            const specs = (line.specs ?? {}) as {
              stock?: string;
              finish?: string;
              applied?: Array<{ type: string }>;
            };
            const priced = specs.applied?.some(
              (a) => a.type === "QUANTITY_TIER",
            );
            return {
              description: line.description,
              quantity: line.quantity,
              unitPriceOverride: priced ? null : Number(line.unitPrice),
              stock: specs.stock ?? "",
              finish: specs.finish ?? "",
            };
          }),
        }}
      />
    </div>
  );
}
