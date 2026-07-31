import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { QuoteStatusBadge } from "@/components/quotes/quote-status-badge";
import { RfqIntake } from "@/components/quotes/rfq-intake";
import { isAiEnabled } from "@/lib/ai/client";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireOrg } from "@/lib/auth/require-org";
import { readGeneralConfig } from "@/lib/db/org-settings";
import { tenantDb } from "@/lib/db/tenant";
import { formatMoney } from "@/lib/format/money";

export const metadata = { title: "Quotes" };

export default async function QuotesPage() {
  const { orgId } = await requireOrg();
  const { currency } = await readGeneralConfig(orgId);

  const quotes = await tenantDb(orgId).quote.findMany({
    where: { deletedAt: null },
    include: {
      company: { select: { id: true, name: true } },
      priceTier: { select: { name: true } },
    },
    orderBy: { quoteNumber: "desc" },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Quotes</h1>
        <Button render={<Link href="/quotes/new" />}>
          <Plus aria-hidden /> New quote
        </Button>
      </div>

      {isAiEnabled() ? <RfqIntake currency={currency} /> : null}

      {quotes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-muted-foreground">
          <FileText className="size-8" aria-hidden />
          <p>No quotes yet. Create the first one.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Valid until</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.map((quote) => (
                <TableRow key={quote.id}>
                  <TableCell>
                    <Link
                      href={`/quotes/${quote.id}`}
                      className="font-mono font-medium hover:underline"
                    >
                      {quote.quoteNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/companies/${quote.company.id}`}
                      className="hover:underline"
                    >
                      {quote.company.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <QuoteStatusBadge status={quote.status} />
                  </TableCell>
                  <TableCell>{quote.priceTier?.name ?? "—"}</TableCell>
                  <TableCell>
                    {quote.validUntil
                      ? quote.validUntil.toLocaleDateString("sv-SE")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatMoney(quote.total, currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
