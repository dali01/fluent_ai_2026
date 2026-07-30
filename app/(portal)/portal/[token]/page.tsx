import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { PortalUploadForm } from "@/components/portal/portal-upload-form";
import { ProofSignForm } from "@/components/portal/proof-sign-form";
import { ReorderButton } from "@/components/portal/reorder-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { resolvePortalToken } from "@/lib/portal/auth";
import { JOB_STATUSES } from "@/lib/validation/jobs";
import { cn } from "@/lib/utils";

const STAGE_LABELS: Record<string, string> = {
  DESIGN: "Design",
  PROOFING: "Proofing",
  PREPRESS: "Prepress",
  PRINTING: "Printing",
  FINISHING: "Finishing",
  SHIPPING: "Shipping",
  DONE: "Done",
};

function StatusTimeline({ status }: { status: string }) {
  const currentIndex = JOB_STATUSES.indexOf(
    status as (typeof JOB_STATUSES)[number],
  );
  return (
    <ol className="flex flex-wrap items-center gap-1.5">
      {JOB_STATUSES.map((stage, index) => {
        const reached = index <= currentIndex;
        const current = index === currentIndex;
        return (
          <li key={stage} className="flex items-center gap-1.5">
            {index > 0 ? (
              <span
                className={cn("h-px w-4", reached ? "bg-primary" : "bg-border")}
                aria-hidden
              />
            ) : null}
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs",
                current
                  ? "bg-primary font-medium text-primary-foreground"
                  : reached
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {STAGE_LABELS[stage]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default async function PortalHomePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const portal = await resolvePortalToken(token);
  if (!portal) notFound();

  const [activeJobs, doneJobs, pendingProofs] = await Promise.all([
    portal.db.job.findMany({
      where: {
        companyId: portal.company.id,
        deletedAt: null,
        status: { not: "DONE" },
      },
      orderBy: [{ rush: "desc" }, { dueDate: "asc" }],
    }),
    portal.db.job.findMany({
      where: { companyId: portal.company.id, deletedAt: null, status: "DONE" },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
    portal.db.proof.findMany({
      where: { status: "SENT", job: { companyId: portal.company.id } },
      include: {
        job: { select: { jobNumber: true, title: true } },
        jobFile: { select: { fileName: true, version: true, blobKey: true } },
      },
      orderBy: { sentAt: "asc" },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Hi {portal.contact.firstName} 👋
        </h1>
        <p className="text-sm text-muted-foreground">
          Live status for {portal.company.name}&apos;s orders with{" "}
          {portal.orgName}.
        </p>
      </div>

      {pendingProofs.length > 0 ? (
        <Card className="border-chart-2/40">
          <CardHeader>
            <CardTitle>
              Proofs waiting for your approval ({pendingProofs.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {pendingProofs.map((proof) => (
              <div key={proof.id} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    <span className="font-mono text-muted-foreground">
                      #{proof.job.jobNumber}
                    </span>{" "}
                    <span className="font-medium">{proof.job.title}</span>
                    {proof.jobFile ? (
                      <>
                        {" — "}
                        <a
                          href={`/api/files/${proof.jobFile.blobKey}?token=${token}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          View {proof.jobFile.fileName} v{proof.jobFile.version}
                        </a>
                      </>
                    ) : null}
                  </span>
                  {proof.sentAt ? (
                    <span className="text-xs text-muted-foreground">
                      Sent {proof.sentAt.toLocaleDateString("sv-SE")}
                    </span>
                  ) : null}
                </div>
                <ProofSignForm token={token} proofId={proof.id} />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Orders in progress ({activeJobs.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {activeJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No orders in production right now.
            </p>
          ) : (
            activeJobs.map((job) => (
              <div key={job.id} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    <span className="font-mono text-muted-foreground">
                      #{job.jobNumber}
                    </span>{" "}
                    <span className="font-medium">{job.title}</span>
                    {job.rush ? (
                      <Badge variant="destructive" className="ml-2">
                        Rush
                      </Badge>
                    ) : null}
                  </span>
                  {job.dueDate ? (
                    <span className="text-xs text-muted-foreground">
                      Due {job.dueDate.toLocaleDateString("sv-SE")}
                    </span>
                  ) : null}
                </div>
                <StatusTimeline status={job.status} />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Send us artwork</CardTitle>
        </CardHeader>
        <CardContent>
          {activeJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Uploads open when you have an order in progress.
            </p>
          ) : (
            <PortalUploadForm
              token={token}
              jobs={activeJobs.map((job) => ({
                id: job.id,
                label: `#${job.jobNumber} ${job.title}`,
              }))}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Order again</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {doneJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Completed orders show up here for one-click reordering.
            </p>
          ) : (
            doneJobs.map((job) => (
              <div
                key={job.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-chart-5" aria-hidden />
                  <span className="font-mono text-muted-foreground">
                    #{job.jobNumber}
                  </span>{" "}
                  <span className="font-medium">{job.title}</span>
                  <span className="text-muted-foreground">
                    ×{job.quantity.toLocaleString("sv-SE")}
                  </span>
                </span>
                <ReorderButton token={token} jobId={job.id} />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
