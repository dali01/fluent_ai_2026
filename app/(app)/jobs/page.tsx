import Link from "next/link";
import { KanbanSquare, Layers, Plus, Printer, Zap } from "lucide-react";
import { JobStatusBadge } from "@/components/jobs/job-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { readGeneralConfig } from "@/lib/db/org-settings";
import { formatMoney } from "@/lib/format/money";
import { findBatchOpportunities } from "@/lib/production/report";

export const metadata = { title: "Jobs" };

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { orgId } = await requireOrg();
  const { q } = await searchParams;

  const [jobs, batches, { currency }] = await Promise.all([
    tenantDb(orgId).job.findMany({
      where: {
        deletedAt: null,
        ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
      },
      include: { company: { select: { id: true, name: true } } },
      orderBy: { jobNumber: "desc" },
    }),
    findBatchOpportunities(orgId),
    readGeneralConfig(orgId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
        <div className="flex gap-2">
          <Button variant="outline" render={<Link href="/jobs/board" />}>
            <KanbanSquare aria-hidden /> Production board
          </Button>
          <Button render={<Link href="/jobs/new" />}>
            <Plus aria-hidden /> New job
          </Button>
        </div>
      </div>

      {/* Batching is a suggestion, never an action — a consolidation
          that wastes stock destroys trust the first time it is wrong,
          so the caveats are shown with the saving, not behind it. */}
      {batches.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-xl border border-chart-2/40 bg-chart-2/5 p-4">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-chart-2" aria-hidden />
            <h2 className="font-heading font-semibold">
              Batching opportunities ({batches.length})
            </h2>
          </div>
          {batches.slice(0, 3).map((batch) => (
            <div
              key={`${batch.stock}-${batch.colorMode}-${batch.finish}`}
              className="flex flex-col gap-1.5 rounded-lg border bg-card p-3 text-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{batch.rationale}</span>
                {batch.savingCents !== null ? (
                  <span className="font-mono font-semibold text-chart-2">
                    ≈{formatMoney(batch.savingCents / 100, currency)}
                  </span>
                ) : null}
              </div>
              <div className="text-muted-foreground">
                {batch.jobs
                  .map(
                    (j) =>
                      `#${j.jobNumber} ${j.title} (${j.quantity.toLocaleString("sv-SE")}${
                        j.piecesPerSheet ? `, ${j.piecesPerSheet}-up` : ""
                      })`,
                  )
                  .join(" · ")}
              </div>
              {batch.runBy ? (
                <div className="text-muted-foreground">
                  Must run by {batch.runBy.toLocaleDateString("sv-SE")}
                </div>
              ) : null}
              <ul className="list-disc pl-5 text-xs text-muted-foreground">
                {batch.caveats.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      <form className="flex gap-2" action="/jobs">
        <Input
          name="q"
          placeholder="Search jobs…"
          defaultValue={q}
          className="max-w-xs"
        />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      {jobs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-muted-foreground">
          <Printer className="size-8" aria-hidden />
          <p>No jobs yet. Create the first one.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Due</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-mono text-muted-foreground">
                    {job.jobNumber}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/jobs/${job.id}`}
                      className="font-medium hover:underline"
                    >
                      {job.title}
                    </Link>
                    {job.rush ? (
                      <Badge variant="destructive" className="ml-2 gap-1">
                        <Zap className="size-3" aria-hidden /> Rush
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/companies/${job.company.id}`}
                      className="hover:underline"
                    >
                      {job.company.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <JobStatusBadge status={job.status} />
                  </TableCell>
                  <TableCell className="font-mono">
                    {job.quantity.toLocaleString("sv-SE")}
                  </TableCell>
                  <TableCell>
                    {job.dueDate
                      ? job.dueDate.toLocaleDateString("sv-SE")
                      : "—"}
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
