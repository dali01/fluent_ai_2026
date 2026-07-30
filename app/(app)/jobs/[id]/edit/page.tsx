import { notFound } from "next/navigation";
import { JobForm } from "@/components/jobs/job-form";
import { updateJob } from "@/lib/actions/jobs";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";

export const metadata = { title: "Edit job" };

export default async function EditJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { orgId } = await requireOrg();
  const { id } = await params;

  const db = tenantDb(orgId);
  const [job, companies, presses] = await Promise.all([
    db.job.findUnique({ where: { id } }),
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
  if (!job || job.deletedAt) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Edit job #{job.jobNumber}
      </h1>
      <JobForm
        action={updateJob.bind(null, job.id)}
        initial={{
          title: job.title,
          companyId: job.companyId,
          status: job.status,
          pressId: job.pressId ?? "",
          stock: job.stock ?? "",
          sizeName: job.sizeName ?? "",
          widthMm: job.widthMm?.toString() ?? "",
          heightMm: job.heightMm?.toString() ?? "",
          colorMode: job.colorMode,
          finish: job.finish ?? "",
          binding: job.binding ?? "",
          quantity: String(job.quantity),
          bleedMm: job.bleedMm?.toString() ?? "",
          rush: job.rush,
          dueDate: job.dueDate ? job.dueDate.toISOString().slice(0, 10) : "",
          notes: job.notes ?? "",
        }}
        companies={companies}
        presses={presses}
        submitLabel="Save changes"
      />
    </div>
  );
}
