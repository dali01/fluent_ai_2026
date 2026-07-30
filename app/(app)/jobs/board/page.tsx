import Link from "next/link";
import { List } from "lucide-react";
import {
  type BoardJob,
  ProductionBoard,
} from "@/components/jobs/production-board";
import { Button } from "@/components/ui/button";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";

export const metadata = { title: "Production board" };

export default async function ProductionBoardPage() {
  const { orgId } = await requireOrg();

  const jobs = await tenantDb(orgId).job.findMany({
    where: { deletedAt: null },
    include: { company: { select: { name: true } } },
    orderBy: [{ rush: "desc" }, { dueDate: "asc" }],
  });

  const boardJobs: BoardJob[] = jobs.map((job) => ({
    id: job.id,
    jobNumber: job.jobNumber,
    title: job.title,
    status: job.status,
    companyName: job.company.name,
    quantity: job.quantity,
    rush: job.rush,
    dueDate: job.dueDate ? job.dueDate.toISOString() : null,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          Production board
        </h1>
        <Button variant="outline" render={<Link href="/jobs" />}>
          <List aria-hidden /> Job list
        </Button>
      </div>
      <ProductionBoard jobs={boardJobs} />
    </div>
  );
}
