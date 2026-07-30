"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";
import {
  computeQuote,
  type EngineRule,
  type LineInput,
} from "@/lib/pricing/engine";
import { QUOTE_TRANSITIONS, quoteSchema } from "@/lib/validation/quotes";
import type { ActionResult } from "./form";
import { actionOk } from "./form";

/** Load active rules + the company's tier and price the lines. */
async function priceQuote(
  orgId: string,
  companyId: string,
  lines: LineInput[],
  rush: boolean,
) {
  const db = tenantDb(orgId);
  const [rules, company] = await Promise.all([
    db.pricingRule.findMany({ where: { active: true } }),
    db.company.findUniqueOrThrow({
      where: { id: companyId },
      include: { priceTier: true },
    }),
  ]);
  const engineRules: EngineRule[] = rules.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    config: r.config,
  }));
  const tierMultiplier = company.priceTier
    ? Number(company.priceTier.multiplier)
    : 1;
  return {
    computation: computeQuote(lines, engineRules, { rush, tierMultiplier }),
    priceTierId: company.priceTierId,
  };
}

/** Quote payload arrives as JSON (the builder is fully client-driven). */
export async function saveQuote(
  quoteId: string | null,
  payload: unknown,
): Promise<ActionResult & { quoteId?: string }> {
  const { orgId, userId } = await requireOrg();
  const parsed = quoteSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid quote",
    };
  }
  const data = parsed.data;
  const db = tenantDb(orgId);

  const { computation, priceTierId } = await priceQuote(
    orgId,
    data.companyId,
    data.lines,
    data.rush,
  );

  const quoteFields = {
    companyId: data.companyId,
    priceTierId,
    subtotal: computation.subtotal,
    taxRate: computation.taxRate,
    taxAmount: computation.taxAmount,
    total: computation.total,
    pricingBreakdown: JSON.parse(
      JSON.stringify({ ...computation, rush: data.rush }),
    ),
    validUntil: data.validUntil ? new Date(data.validUntil) : null,
    notes: data.notes || null,
  };

  let id = quoteId;
  if (id) {
    const existing = await db.quote.findUniqueOrThrow({ where: { id } });
    if (existing.status !== "DRAFT") {
      return { ok: false, error: "Only draft quotes can be edited" };
    }
    await db.quoteLineItem.deleteMany({ where: { quoteId: id } });
    await db.quote.update({ where: { id }, data: quoteFields });
  } else {
    const max = await db.quote.aggregate({ _max: { quoteNumber: true } });
    const quote = await db.quote.create({
      data: {
        organizationId: orgId,
        quoteNumber: (max._max.quoteNumber ?? 1000) + 1,
        ...quoteFields,
      },
    });
    id = quote.id;
    await db.activityLog.create({
      data: {
        organizationId: orgId,
        type: "SYSTEM",
        summary: `Quote #${quote.quoteNumber} created`,
        actorId: userId,
      },
    });
  }

  await db.quoteLineItem.createMany({
    data: computation.lines.map((line, index) => ({
      organizationId: orgId,
      quoteId: id!,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      total: line.total,
      specs: JSON.parse(
        JSON.stringify({
          ...data.lines[index]?.specs,
          applied: line.applied,
        }),
      ),
      sortOrder: index,
    })),
  });

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${id}`);
  return { ...actionOk, quoteId: id! };
}

export async function transitionQuote(
  quoteId: string,
  next: string,
): Promise<ActionResult> {
  const { orgId, userId } = await requireOrg();
  const db = tenantDb(orgId);

  const quote = await db.quote.findUniqueOrThrow({ where: { id: quoteId } });
  const allowed = QUOTE_TRANSITIONS[quote.status] ?? [];
  if (!allowed.includes(next)) {
    return { ok: false, error: `Cannot go from ${quote.status} to ${next}` };
  }

  await db.quote.update({
    where: { id: quoteId },
    data: { status: next as never },
  });
  await db.activityLog.create({
    data: {
      organizationId: orgId,
      type: next === "SENT" ? "QUOTE_SENT" : "SYSTEM",
      summary: `Quote #${quote.quoteNumber} ${next.toLowerCase()}`,
      actorId: userId,
    },
  });

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${quoteId}`);
  return actionOk;
}

/** Accepted quote → draft invoice with a 50% deposit (print convention). */
export async function convertQuoteToInvoice(quoteId: string): Promise<void> {
  const { orgId, userId } = await requireOrg();
  const db = tenantDb(orgId);

  const quote = await db.quote.findUniqueOrThrow({ where: { id: quoteId } });
  if (quote.status !== "ACCEPTED") {
    throw new Error("Only accepted quotes can be converted");
  }

  const max = await db.invoice.aggregate({ _max: { invoiceNumber: true } });
  const invoice = await db.invoice.create({
    data: {
      organizationId: orgId,
      invoiceNumber: (max._max.invoiceNumber ?? 3000) + 1,
      companyId: quote.companyId,
      quoteId: quote.id,
      status: "DRAFT",
      subtotal: quote.subtotal,
      taxAmount: quote.taxAmount,
      total: quote.total,
      depositAmount: Math.round(Number(quote.total) * 0.5 * 100) / 100,
      dueDate: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    },
  });
  await db.quote.update({
    where: { id: quoteId },
    data: { status: "CONVERTED" },
  });
  await db.activityLog.create({
    data: {
      organizationId: orgId,
      type: "SYSTEM",
      summary: `Quote #${quote.quoteNumber} converted to invoice #${invoice.invoiceNumber}`,
      actorId: userId,
    },
  });

  revalidatePath("/quotes");
  revalidatePath("/invoices");
  redirect("/invoices");
}

/** Spin an accepted quote into a production job carrying its specs. */
export async function createJobFromQuote(quoteId: string): Promise<void> {
  const { orgId, userId } = await requireOrg();
  const db = tenantDb(orgId);

  const quote = await db.quote.findUniqueOrThrow({
    where: { id: quoteId },
    include: { lineItems: { orderBy: { sortOrder: "asc" }, take: 1 } },
  });
  const existing = await db.job.findFirst({ where: { quoteId } });
  if (existing) redirect(`/jobs/${existing.id}`);

  const firstLine = quote.lineItems[0];
  const specs = (firstLine?.specs ?? {}) as {
    stock?: string;
    finish?: string;
  };

  const max = await db.job.aggregate({ _max: { jobNumber: true } });
  const job = await db.job.create({
    data: {
      organizationId: orgId,
      jobNumber: (max._max.jobNumber ?? 2000) + 1,
      title: firstLine?.description ?? `Quote #${quote.quoteNumber}`,
      companyId: quote.companyId,
      quoteId: quote.id,
      status: "DESIGN",
      quantity: firstLine?.quantity ?? 0,
      stock: specs.stock ?? null,
      finish: specs.finish ?? null,
    },
  });
  await db.activityLog.create({
    data: {
      organizationId: orgId,
      type: "SYSTEM",
      summary: `Job #${job.jobNumber} created from quote #${quote.quoteNumber}`,
      jobId: job.id,
      actorId: userId,
    },
  });

  revalidatePath("/jobs");
  redirect(`/jobs/${job.id}`);
}

/** Live pricing preview for the builder. */
export async function previewQuote(
  payload: unknown,
): Promise<
  | { ok: true; computation: ReturnType<typeof computeQuote> }
  | { ok: false; error: string }
> {
  const { orgId } = await requireOrg();
  const parsed = quoteSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }
  const { computation } = await priceQuote(
    orgId,
    parsed.data.companyId,
    parsed.data.lines,
    parsed.data.rush,
  );
  return { ok: true, computation };
}
