"use server";

import { isAiEnabled } from "@/lib/ai/client";
import { extractRfq, type RfqExtraction } from "@/lib/ai/rfq";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";
import {
  computeQuote,
  type EngineRule,
  type QuoteComputation,
} from "@/lib/pricing/engine";

/**
 * Paste an enquiry → structured spec → priced draft. Claude only does
 * the extraction; the deterministic engine does the money, and nothing
 * is written to the database until the CSR saves the quote from the
 * normal builder (docs/ai-roadmap.md §1.1).
 */

export type RfqDraft = {
  extraction: RfqExtraction;
  /** null when the engine has no rules to price with */
  pricing: QuoteComputation | null;
  /** resolved against the org's companies; null when unmatched */
  matchedCompanyId: string | null;
  matchedCompanyName: string | null;
};

export type RfqResult =
  | { ok: true; draft: RfqDraft }
  | { ok: false; error: string };

export async function draftQuoteFromEnquiry(
  text: string,
): Promise<RfqResult> {
  const { orgId } = await requireOrg();
  if (!isAiEnabled()) {
    return { ok: false, error: "AI is not configured (ANTHROPIC_API_KEY)" };
  }
  const trimmed = text.trim();
  if (trimmed.length < 20) {
    return { ok: false, error: "Paste the enquiry text first" };
  }

  const db = tenantDb(orgId);
  const companies = await db.company.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, priceTier: true },
    orderBy: { name: "asc" },
    take: 500,
  });

  let extraction: RfqExtraction | null;
  try {
    extraction = await extractRfq({
      orgId,
      text: trimmed,
      knownCompanies: companies.map((c) => c.name),
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Extraction failed",
    };
  }
  if (!extraction) return { ok: false, error: "AI unavailable" };

  // Match by exact name — the prompt asks the model to reuse an existing
  // name verbatim, and a fuzzy match here would silently attach a quote
  // to the wrong customer.
  const matched = extraction.companyName
    ? (companies.find(
        (c) =>
          c.name.toLowerCase() === extraction!.companyName!.trim().toLowerCase(),
      ) ?? null)
    : null;

  const rules = await db.pricingRule.findMany({ where: { active: true } });
  const engineRules: EngineRule[] = rules.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    config: r.config,
  }));

  const pricing =
    engineRules.length > 0
      ? computeQuote(
          extraction.lines.map((line) => ({
            description: line.description,
            quantity: line.quantity,
            specs: {
              stock: line.stock ?? undefined,
              finish: line.finish ?? undefined,
            },
          })),
          engineRules,
          {
            rush: extraction.rush,
            tierMultiplier: matched?.priceTier
              ? Number(matched.priceTier.multiplier)
              : 1,
          },
        )
      : null;

  return {
    ok: true,
    draft: {
      extraction,
      pricing,
      matchedCompanyId: matched?.id ?? null,
      matchedCompanyName: matched?.name ?? null,
    },
  };
}
