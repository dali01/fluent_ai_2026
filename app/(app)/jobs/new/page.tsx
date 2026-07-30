import { JobForm } from "@/components/jobs/job-form";
import { createJob } from "@/lib/actions/jobs";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";

export const metadata = { title: "New job" };

export default async function NewJobPage() {
  const { orgId } = await requireOrg();
  const db = tenantDb(orgId);
  const [companies, presses] = await Promise.all([
    db.company.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.press.findMany({
      where: { deletedAt: null, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">New job</h1>
      <JobForm
        action={createJob}
        companies={companies}
        presses={presses}
        submitLabel="Create job"
      />
    </div>
  );
}
