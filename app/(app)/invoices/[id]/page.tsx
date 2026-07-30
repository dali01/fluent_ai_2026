import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceTransitionButtons } from "@/components/invoices/invoice-actions";
import { PaymentDialog } from "@/components/invoices/payment-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";
import { INVOICE_TRANSITIONS } from "@/lib/validation/invoices";

export const metadata = { title: "Invoice" };

const kr = (n: unknown) =>
  `${Number(n).toLocaleString("sv-SE", { maximumFractionDigits: 2 })} kr`;

const STATUS_VARIANT: Record<string, "secondary" | "destructive" | "outline"> =
  {
    DRAFT: "outline",
    SENT: "secondary",
    PARTIALLY_PAID: "secondary",
    PAID: "secondary",
    OVERDUE: "destructive",
    VOID: "outline",
  };

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { orgId } = await requireOrg();
  const { id } = await params;

  const invoice = await tenantDb(orgId).invoice.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, name: true } },
      quote: { select: { id: true, quoteNumber: true } },
      job: { select: { id: true, jobNumber: true, title: true } },
      payments: { orderBy: { paidAt: "asc" } },
    },
  });
  if (!invoice || invoice.deletedAt) notFound();

  const paid = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);
  const remaining = Math.max(0, Number(invoice.total) - paid);
  const payable = !["DRAFT", "VOID", "PAID"].includes(invoice.status);
  const depositOutstanding =
    invoice.depositAmount && paid < Number(invoice.depositAmount)
      ? Number(invoice.depositAmount) - paid
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Invoice <span className="font-mono">#{invoice.invoiceNumber}</span>
          </h1>
          <Badge variant={STATUS_VARIANT[invoice.status] ?? "outline"}>
            {invoice.status.replaceAll("_", " ").toLowerCase()}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {payable ? (
            <PaymentDialog
              invoiceId={invoice.id}
              remaining={remaining}
              suggestDeposit={depositOutstanding}
            />
          ) : null}
          <InvoiceTransitionButtons
            invoiceId={invoice.id}
            transitions={INVOICE_TRANSITIONS[invoice.status] ?? []}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Company</span>
              <Link
                href={`/companies/${invoice.company.id}`}
                className="font-medium hover:underline"
              >
                {invoice.company.name}
              </Link>
            </div>
            {invoice.quote ? (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Quote</span>
                <Link
                  href={`/quotes/${invoice.quote.id}`}
                  className="font-mono hover:underline"
                >
                  #{invoice.quote.quoteNumber}
                </Link>
              </div>
            ) : null}
            {invoice.job ? (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Job</span>
                <Link
                  href={`/jobs/${invoice.job.id}`}
                  className="font-mono hover:underline"
                >
                  #{invoice.job.jobNumber}
                </Link>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Issued</span>
              <span>
                {invoice.issuedAt
                  ? invoice.issuedAt.toLocaleDateString("sv-SE")
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Due</span>
              <span>
                {invoice.dueDate
                  ? invoice.dueDate.toLocaleDateString("sv-SE")
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Accounting sync</span>
              <span className="font-mono text-xs">
                {invoice.externalSyncId ?? "not synced"}
              </span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span>Subtotal</span>
              <span className="font-mono">{kr(invoice.subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>VAT</span>
              <span className="font-mono">{kr(invoice.taxAmount)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span className="font-mono">{kr(invoice.total)}</span>
            </div>
            {invoice.depositAmount ? (
              <div className="flex justify-between text-muted-foreground">
                <span>Deposit (50%)</span>
                <span className="font-mono">{kr(invoice.depositAmount)}</span>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              Payments — {kr(paid)} of {kr(invoice.total)}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-chart-5"
                style={{
                  width: `${Math.min(100, (paid / Number(invoice.total)) * 100)}%`,
                }}
              />
            </div>
            {invoice.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No payments recorded yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {invoice.payments.map((payment) => (
                  <li
                    key={payment.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <span>
                      {payment.paidAt.toLocaleDateString("sv-SE")}
                      {payment.isDeposit ? (
                        <Badge variant="secondary" className="ml-2">
                          Deposit
                        </Badge>
                      ) : null}
                      {payment.reference ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {payment.reference}
                        </span>
                      ) : null}
                    </span>
                    <span className="font-mono">{kr(payment.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
            {remaining > 0 && payable ? (
              <p className="text-sm text-muted-foreground">
                {kr(remaining)} outstanding
                {depositOutstanding
                  ? ` (${kr(depositOutstanding)} of the deposit unpaid)`
                  : ""}
                .
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
