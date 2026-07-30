import Link from "next/link";
import { KanbanSquare, Plus, Printer, Zap } from "lucide-react";
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

export const metadata = { title: "Jobs" };

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { orgId } = await requireOrg();
  const { q } = await searchParams;

  const jobs = await tenantDb(orgId).job.findMany({
    where: {
      deletedAt: null,
      ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
    },
    include: { company: { select: { id: true, name: true } } },
    orderBy: { jobNumber: "desc" },
  });

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
