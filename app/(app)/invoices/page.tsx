import Link from "next/link";
import { Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";

export const metadata = { title: "Invoices" };

const STATUS_VARIANT: Record<string, "secondary" | "destructive" | "outline"> =
  {
    DRAFT: "outline",
    SENT: "secondary",
    PARTIALLY_PAID: "secondary",
    PAID: "secondary",
    OVERDUE: "destructive",
    VOID: "outline",
  };

export default async function InvoicesPage() {
  const { orgId } = await requireOrg();

  const invoices = await tenantDb(orgId).invoice.findMany({
    where: { deletedAt: null },
    include: {
      company: { select: { id: true, name: true } },
      quote: { select: { id: true, quoteNumber: true } },
    },
    orderBy: { invoiceNumber: "desc" },
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
      <p className="text-sm text-muted-foreground">
        Open an invoice to send it, record payments and track deposits.
      </p>

      {invoices.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-muted-foreground">
          <Receipt className="size-8" aria-hidden />
          <p>No invoices yet. Convert an accepted quote to create one.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Quote</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Deposit</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>
                    <Link
                      href={`/invoices/${invoice.id}`}
                      className="font-mono font-medium hover:underline"
                    >
                      {invoice.invoiceNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/companies/${invoice.company.id}`}
                      className="hover:underline"
                    >
                      {invoice.company.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={STATUS_VARIANT[invoice.status] ?? "outline"}
                    >
                      {invoice.status.replaceAll("_", " ").toLowerCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {invoice.quote ? (
                      <Link
                        href={`/quotes/${invoice.quote.id}`}
                        className="font-mono hover:underline"
                      >
                        #{invoice.quote.quoteNumber}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {invoice.dueDate
                      ? invoice.dueDate.toLocaleDateString("sv-SE")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {invoice.depositAmount
                      ? `${Number(invoice.depositAmount).toLocaleString("sv-SE")} kr`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {Number(invoice.total).toLocaleString("sv-SE")} kr
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
