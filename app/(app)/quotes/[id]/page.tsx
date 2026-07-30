import Link from "next/link";
import { notFound } from "next/navigation";
import { FileOutput, Pencil, Printer } from "lucide-react";
import { QuoteTransitionButtons } from "@/components/quotes/quote-actions";
import { QuoteStatusBadge } from "@/components/quotes/quote-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  convertQuoteToInvoice,
  createJobFromQuote,
} from "@/lib/actions/quotes";
import { requireOrg } from "@/lib/auth/require-org";
import { readGeneralConfig } from "@/lib/db/org-settings";
import { tenantDb } from "@/lib/db/tenant";
import { formatMoney } from "@/lib/format/money";
import { QUOTE_TRANSITIONS } from "@/lib/validation/quotes";

export const metadata = { title: "Quote" };

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { orgId } = await requireOrg();
  const { id } = await params;
  const { currency } = await readGeneralConfig(orgId);
  const kr = (n: unknown) => formatMoney(Number(n), currency);

  const quote = await tenantDb(orgId).quote.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, name: true } },
      priceTier: true,
      lineItems: { orderBy: { sortOrder: "asc" } },
      invoices: { select: { id: true, invoiceNumber: true } },
      job: { select: { id: true, jobNumber: true } },
    },
  });
  if (!quote || quote.deletedAt) notFound();

  const breakdown = quote.pricingBreakdown as {
    rushFee?: number;
    tierAdjustment?: number;
    tierMultiplier?: number;
    rush?: boolean;
  } | null;
  const transitions = QUOTE_TRANSITIONS[quote.status] ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Quote <span className="font-mono">#{quote.quoteNumber}</span>
          </h1>
          <QuoteStatusBadge status={quote.status} />
        </div>
        <div className="flex flex-wrap gap-2">
          {quote.status === "DRAFT" ? (
            <Button
              variant="outline"
              render={<Link href={`/quotes/${quote.id}/edit`} />}
            >
              <Pencil aria-hidden /> Edit
            </Button>
          ) : null}
          <QuoteTransitionButtons
            quoteId={quote.id}
            transitions={transitions}
          />
          {quote.status === "ACCEPTED" ? (
            <>
              <form action={convertQuoteToInvoice.bind(null, quote.id)}>
                <Button type="submit">
                  <FileOutput aria-hidden /> Convert to invoice
                </Button>
              </form>
              {!quote.job ? (
                <form action={createJobFromQuote.bind(null, quote.id)}>
                  <Button type="submit" variant="outline">
                    <Printer aria-hidden /> Create job
                  </Button>
                </form>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>Line items</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quote.lineItems.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>{line.description}</TableCell>
                    <TableCell className="text-right font-mono">
                      {line.quantity.toLocaleString("sv-SE")}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {kr(line.unitPrice)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {kr(line.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Company</span>
              <Link
                href={`/companies/${quote.company.id}`}
                className="font-medium hover:underline"
              >
                {quote.company.name}
              </Link>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Tier</span>
              <span>
                {quote.priceTier
                  ? `${quote.priceTier.name} ×${Number(quote.priceTier.multiplier)}`
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Valid until</span>
              <span>
                {quote.validUntil
                  ? quote.validUntil.toLocaleDateString("sv-SE")
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span>Subtotal</span>
              <span className="font-mono">{kr(quote.subtotal)}</span>
            </div>
            {breakdown?.rushFee ? (
              <div className="flex justify-between text-muted-foreground">
                <span>Rush fee</span>
                <span className="font-mono">{kr(breakdown.rushFee)}</span>
              </div>
            ) : null}
            {breakdown?.tierAdjustment ? (
              <div className="flex justify-between text-muted-foreground">
                <span>Tier adjustment</span>
                <span className="font-mono">
                  {kr(breakdown.tierAdjustment)}
                </span>
              </div>
            ) : null}
            <div className="flex justify-between text-muted-foreground">
              <span>VAT {Math.round(Number(quote.taxRate) * 100)}%</span>
              <span className="font-mono">{kr(quote.taxAmount)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <span>Total</span>
              <span className="font-mono">{kr(quote.total)}</span>
            </div>
            {quote.invoices.length > 0 ? (
              <p className="pt-1 text-muted-foreground">
                Invoice{" "}
                {quote.invoices.map((inv) => (
                  <Link
                    key={inv.id}
                    href="/invoices"
                    className="font-mono text-primary hover:underline"
                  >
                    #{inv.invoiceNumber}
                  </Link>
                ))}
              </p>
            ) : null}
            {quote.job ? (
              <p className="text-muted-foreground">
                Job{" "}
                <Link
                  href={`/jobs/${quote.job.id}`}
                  className="font-mono text-primary hover:underline"
                >
                  #{quote.job.jobNumber}
                </Link>
              </p>
            ) : null}
            {quote.notes ? (
              <p className="whitespace-pre-wrap border-t pt-2">{quote.notes}</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
