"use server";

import { revalidatePath } from "next/cache";
import { getAccountingProvider } from "@/lib/accounting";
import { requireOrg } from "@/lib/auth/require-org";
import { readGeneralConfig } from "@/lib/db/org-settings";
import { tenantDb } from "@/lib/db/tenant";
import { formatMoney } from "@/lib/format/money";
import { INVOICE_TRANSITIONS, paymentSchema } from "@/lib/validation/invoices";
import { type ActionResult, actionOk, parseForm } from "./form";

export async function transitionInvoice(
  invoiceId: string,
  next: string,
): Promise<ActionResult> {
  const { orgId, userId } = await requireOrg();
  const db = tenantDb(orgId);

  const invoice = await db.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { company: { select: { name: true } } },
  });
  const allowed = INVOICE_TRANSITIONS[invoice.status] ?? [];
  if (!allowed.includes(next)) {
    return { ok: false, error: `Cannot go from ${invoice.status} to ${next}` };
  }

  let externalSyncId = invoice.externalSyncId;
  if (next === "SENT" && !externalSyncId) {
    const sync = await getAccountingProvider().pushInvoice({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      companyName: invoice.company.name,
      total: Number(invoice.total),
      taxAmount: Number(invoice.taxAmount),
      dueDate: invoice.dueDate?.toISOString() ?? null,
    });
    externalSyncId = sync.externalId;
  }

  await db.invoice.update({
    where: { id: invoiceId },
    data: {
      status: next as never,
      externalSyncId,
      issuedAt:
        next === "SENT" ? (invoice.issuedAt ?? new Date()) : invoice.issuedAt,
    },
  });
  await db.activityLog.create({
    data: {
      organizationId: orgId,
      type: next === "SENT" ? "INVOICE_SENT" : "SYSTEM",
      summary: `Invoice #${invoice.invoiceNumber} ${next.toLowerCase().replaceAll("_", " ")}`,
      jobId: invoice.jobId,
      actorId: userId,
    },
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  return actionOk;
}

/**
 * Record a payment; invoice status becomes PARTIALLY_PAID or PAID from
 * the paid-total, never set by hand. Overpayment is rejected.
 */
export async function recordPayment(
  invoiceId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { orgId, userId } = await requireOrg();
  const { data, result } = parseForm(paymentSchema, formData, {
    booleans: ["isDeposit"],
  });
  if (!data) return result!;

  const db = tenantDb(orgId);
  const invoice = await db.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { payments: true },
  });
  if (invoice.status === "VOID" || invoice.status === "DRAFT") {
    return {
      ok: false,
      error: `Cannot record payments on a ${invoice.status.toLowerCase()} invoice`,
    };
  }

  const { currency } = await readGeneralConfig(orgId);
  const paidSoFar = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);
  const remaining = Number(invoice.total) - paidSoFar;
  if (data.amount > remaining + 0.01) {
    return {
      ok: false,
      error: `Amount exceeds the ${formatMoney(remaining, currency)} remaining`,
    };
  }

  const payment = await db.payment.create({
    data: {
      organizationId: orgId,
      invoiceId,
      amount: data.amount,
      method: data.method,
      isDeposit: data.isDeposit,
      reference: data.reference || null,
      paidAt: data.paidAt ? new Date(data.paidAt) : new Date(),
    },
  });

  const paidTotal = paidSoFar + data.amount;
  const newStatus =
    paidTotal >= Number(invoice.total) - 0.01 ? "PAID" : "PARTIALLY_PAID";
  await db.invoice.update({
    where: { id: invoiceId },
    data: { status: newStatus },
  });

  if (invoice.externalSyncId) {
    await getAccountingProvider().pushPayment({
      id: payment.id,
      invoiceExternalId: invoice.externalSyncId,
      amount: data.amount,
      paidAt: payment.paidAt.toISOString(),
    });
  }

  await db.activityLog.create({
    data: {
      organizationId: orgId,
      type: "PAYMENT_RECEIVED",
      summary: `${formatMoney(data.amount, currency)} ${data.isDeposit ? "deposit " : ""}received on invoice #${invoice.invoiceNumber} — now ${newStatus.toLowerCase().replaceAll("_", " ")}`,
      jobId: invoice.jobId,
      actorId: userId,
    },
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  return actionOk;
}
