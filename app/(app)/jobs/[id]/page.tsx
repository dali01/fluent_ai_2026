import Link from "next/link";
import { notFound } from "next/navigation";
import { Copy, Download, Pencil } from "lucide-react";
import { ArchiveButton } from "@/components/crm/archive-button";
import { ExplainPrepressButton } from "@/components/jobs/explain-prepress-button";
import { JobMaterialsCard } from "@/components/jobs/job-materials-card";
import { JobStatusBadge } from "@/components/jobs/job-status-badge";
import { PrepressReport } from "@/components/jobs/prepress-report";
import {
  ResolveProofButtons,
  SendProofButton,
} from "@/components/jobs/proof-actions";
import { UploadArtworkForm } from "@/components/jobs/upload-artwork-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { archiveJob, reorderJob } from "@/lib/actions/jobs";
import { computeProfitability } from "@/lib/financials/profitability";
import { requireOrg } from "@/lib/auth/require-org";
import { readGeneralConfig } from "@/lib/db/org-settings";
import { tenantDb } from "@/lib/db/tenant";
import { formatMoney } from "@/lib/format/money";
import type { PrepressResult } from "@/lib/prepress/checks";

export const metadata = { title: "Job" };

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { orgId } = await requireOrg();
  const { id } = await params;

  const db = tenantDb(orgId);
  const job = await db.job.findUnique({
    where: { id },
    include: {
      company: {
        select: {
          id: true,
          name: true,
          contacts: {
            where: { deletedAt: null },
            take: 1,
            select: { id: true },
          },
        },
      },
      press: { select: { name: true } },
      materials: {
        include: { inventoryItem: { select: { name: true, unit: true } } },
        orderBy: { createdAt: "asc" },
      },
      stockMovements: {
        where: { reason: "JOB_CONSUMPTION" },
        select: {
          inventoryItemId: true,
          delta: true,
          inventoryItem: { select: { costPerUnit: true } },
        },
      },
      invoices: {
        where: { deletedAt: null, status: { not: "VOID" } },
        select: { subtotal: true },
        take: 1,
      },
      quote: { select: { id: true, quoteNumber: true, subtotal: true } },
      files: { orderBy: [{ fileName: "asc" }, { version: "desc" }] },
      proofs: {
        orderBy: { createdAt: "desc" },
        include: {
          contact: { select: { firstName: true, lastName: true } },
          jobFile: { select: { fileName: true, version: true } },
        },
      },
    },
  });
  if (!job || job.deletedAt) notFound();

  const [activities, inventoryItems] = await Promise.all([
    db.activityLog.findMany({
      where: { jobId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    db.inventoryItem.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, unit: true },
    }),
  ]);
  const consumedItemIds = new Set(
    job.stockMovements.map((m) => m.inventoryItemId),
  );

  const profit = computeProfitability({
    invoiceSubtotal: job.invoices[0] ? Number(job.invoices[0].subtotal) : null,
    quoteSubtotal: job.quote ? Number(job.quote.subtotal) : null,
    consumption: job.stockMovements.map((m) => ({
      quantity: Math.abs(Number(m.delta)),
      costPerUnit: m.inventoryItem.costPerUnit
        ? Number(m.inventoryItem.costPerUnit)
        : null,
    })),
  });
  const { currency } = await readGeneralConfig(orgId);
  const kr = (n: number) => formatMoney(n, currency);

  const defaultContactId = job.company.contacts[0]?.id ?? null;

  const specs: Array<[string, string]> = [
    ["Stock", job.stock ?? "—"],
    [
      "Size",
      job.sizeName ||
        (job.widthMm && job.heightMm
          ? `${job.widthMm}×${job.heightMm} mm`
          : "—"),
    ],
    ["Color mode", job.colorMode.replaceAll("_", " ")],
    ["Finish", job.finish ?? "—"],
    ["Binding", job.binding ?? "—"],
    ["Quantity", job.quantity.toLocaleString("sv-SE")],
    ["Bleed", job.bleedMm ? `${job.bleedMm} mm` : "—"],
    ["Press", job.press?.name ?? "Unassigned"],
    ["Due", job.dueDate ? job.dueDate.toLocaleDateString("sv-SE") : "—"],
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            <span className="mr-2 font-mono text-muted-foreground">
              #{job.jobNumber}
            </span>
            {job.title}
          </h1>
          <JobStatusBadge status={job.status} />
          {job.rush ? <Badge variant="destructive">Rush</Badge> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={reorderJob.bind(null, job.id)}>
            <Button variant="outline" type="submit">
              <Copy aria-hidden /> Reorder
            </Button>
          </form>
          <Button
            variant="outline"
            render={<Link href={`/jobs/${job.id}/edit`} />}
          >
            <Pencil aria-hidden /> Edit
          </Button>
          <ArchiveButton
            action={archiveJob.bind(null, job.id)}
            entityLabel={`job #${job.jobNumber}`}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Specification</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Company</span>
              <Link
                href={`/companies/${job.company.id}`}
                className="font-medium hover:underline"
              >
                {job.company.name}
              </Link>
            </div>
            {specs.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <span className="text-muted-foreground">{label}</span>
                <span>{value}</span>
              </div>
            ))}
            {job.notes ? (
              <p className="mt-2 whitespace-pre-wrap border-t pt-2">
                {job.notes}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5 text-sm">
            {activities.length === 0 ? (
              <p className="text-muted-foreground">Nothing yet.</p>
            ) : (
              activities.map((activity) => (
                <div key={activity.id} className="flex flex-col">
                  <span>{activity.summary}</span>
                  <span className="text-xs text-muted-foreground">
                    {activity.createdAt.toLocaleString("sv-SE", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profitability (materials)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-4">
          <div className="flex flex-col">
            <span className="text-muted-foreground">
              Revenue{" "}
              {profit.revenueSource ? `(${profit.revenueSource}, ex VAT)` : ""}
            </span>
            <span className="font-mono text-lg font-semibold">
              {profit.revenue != null ? kr(profit.revenue) : "—"}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground">
              Material cost{profit.costComplete ? "" : " (incomplete)"}
            </span>
            <span className="font-mono text-lg font-semibold">
              {kr(profit.materialCost)}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground">Margin</span>
            <span
              className={`font-mono text-lg font-semibold ${profit.margin != null && profit.margin < 0 ? "text-destructive" : ""}`}
            >
              {profit.margin != null ? kr(profit.margin) : "—"}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground">Margin %</span>
            <span className="font-mono text-lg font-semibold">
              {profit.marginPct != null ? `${profit.marginPct}%` : "—"}
            </span>
          </div>
          {!profit.costComplete ? (
            <p className="text-xs text-muted-foreground sm:col-span-4">
              Some consumed materials have no unit cost — set costs in Inventory
              for accurate margins. Labour costing is future work.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <JobMaterialsCard
        jobId={job.id}
        jobDone={job.status === "DONE"}
        materials={job.materials.map((m) => ({
          id: m.id,
          itemName: m.inventoryItem.name,
          unit: m.inventoryItem.unit,
          quantityPlanned: Number(m.quantityPlanned),
          consumed: consumedItemIds.has(m.inventoryItemId),
        }))}
        items={inventoryItems}
      />

      <Card>
        <CardHeader>
          <CardTitle>Artwork & prepress</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <UploadArtworkForm jobId={job.id} />
          {job.files.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No files yet. Upload artwork to run the automatic prepress checks.
            </p>
          ) : (
            job.files.map((file) => (
              <div
                key={file.id}
                className="flex flex-col gap-3 rounded-xl border p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{file.fileName}</span>
                    <Badge variant="outline">v{file.version}</Badge>
                    <Badge
                      variant={
                        file.approvalStatus === "FAILED"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {file.approvalStatus.toLowerCase()}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {(file.sizeBytes / 1024 / 1024).toFixed(1)} MB
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      render={
                        <a
                          href={`/api/files/${file.blobKey}`}
                          target="_blank"
                          rel="noreferrer"
                        />
                      }
                    >
                      <Download aria-hidden /> Download
                    </Button>
                    <SendProofButton
                      jobId={job.id}
                      jobFileId={file.id}
                      contactId={defaultContactId}
                    />
                  </div>
                </div>
                {file.prepressResult ? (
                  <>
                    <PrepressReport
                      result={file.prepressResult as unknown as PrepressResult}
                    />
                    <ExplainPrepressButton jobFileId={file.id} />
                  </>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Proofs</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {job.proofs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No proofs sent yet. Upload artwork, then send it as a proof.
            </p>
          ) : (
            job.proofs.map((proof) => (
              <div
                key={proof.id}
                className="flex flex-col gap-2 rounded-xl border p-4 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        proof.status === "APPROVED"
                          ? "secondary"
                          : proof.status === "REJECTED"
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {proof.status.toLowerCase()}
                    </Badge>
                    <span>
                      {proof.jobFile
                        ? `${proof.jobFile.fileName} v${proof.jobFile.version}`
                        : "—"}
                    </span>
                    {proof.contact ? (
                      <span className="text-muted-foreground">
                        → {proof.contact.firstName} {proof.contact.lastName}
                      </span>
                    ) : null}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {proof.sentAt
                      ? `Sent ${proof.sentAt.toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}`
                      : ""}
                  </span>
                </div>
                {proof.clientComment ? (
                  <p className="text-muted-foreground">
                    “{proof.clientComment}”
                  </p>
                ) : null}
                {proof.status === "SENT" ? (
                  <ResolveProofButtons proofId={proof.id} />
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
