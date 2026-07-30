"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";
import { runPrepressChecks } from "@/lib/prepress/checks";
import { getStorage } from "@/lib/storage";
import type { ActionResult } from "./form";
import { actionOk } from "./form";

const MAX_FILE_BYTES = 40 * 1024 * 1024; // 40 MB

/**
 * Upload artwork for a job: store the file, run deterministic prepress
 * checks, persist the JobFile with results, log activity.
 */
export async function uploadJobFile(
  jobId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { orgId, userId } = await requireOrg();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file to upload" };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: "File is larger than 40 MB" };
  }

  const db = tenantDb(orgId);
  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job || job.deletedAt) return { ok: false, error: "Job not found" };

  const buffer = Buffer.from(await file.arrayBuffer());
  const prepress = await runPrepressChecks(buffer, file.type, file.name, {
    widthMm: job.widthMm ? Number(job.widthMm) : null,
    heightMm: job.heightMm ? Number(job.heightMm) : null,
    bleedMm: job.bleedMm ? Number(job.bleedMm) : null,
  });

  // Version = 1 + latest version of same file name on this job
  const latest = await db.jobFile.findFirst({
    where: { jobId, fileName: file.name },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (latest?.version ?? 0) + 1;

  const safeName = file.name.replaceAll(/[^\w.\-()\s]/g, "_");
  const key = `${orgId}/${jobId}/v${version}-${safeName}`;
  await getStorage().put(key, buffer, {
    contentType: file.type || "application/octet-stream",
  });

  await db.jobFile.create({
    data: {
      organizationId: orgId,
      jobId,
      version,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      blobKey: key,
      kind: "artwork",
      prepressResult: JSON.parse(JSON.stringify(prepress)),
      approvalStatus:
        prepress.verdict === "fail"
          ? "FAILED"
          : prepress.verdict === "pass"
            ? "PASSED"
            : "PENDING",
      uploadedById: userId,
    },
  });
  await db.activityLog.create({
    data: {
      organizationId: orgId,
      type: "FILE_UPLOADED",
      summary: `File "${file.name}" v${version} uploaded to job #${job.jobNumber} — prepress ${prepress.verdict}`,
      jobId,
      actorId: userId,
    },
  });

  revalidatePath(`/jobs/${jobId}`);
  return actionOk;
}

/** Create + send a proof for a job file to the job's company contact. */
export async function sendProof(
  jobId: string,
  jobFileId: string,
  contactId: string | null,
): Promise<ActionResult> {
  const { orgId, userId } = await requireOrg();
  const db = tenantDb(orgId);

  const job = await db.job.findUnique({ where: { id: jobId } });
  if (!job || job.deletedAt) return { ok: false, error: "Job not found" };

  await db.proof.create({
    data: {
      organizationId: orgId,
      jobId,
      jobFileId,
      contactId,
      status: "SENT",
      sentAt: new Date(),
    },
  });
  await db.job.update({ where: { id: jobId }, data: { status: "PROOFING" } });
  await db.activityLog.create({
    data: {
      organizationId: orgId,
      type: "PROOF_SENT",
      summary: `Proof sent for job #${job.jobNumber}`,
      jobId,
      contactId,
      actorId: userId,
    },
  });

  revalidatePath(`/jobs/${jobId}`);
  return actionOk;
}

/**
 * Record the client's decision. Until the client portal exists (Phase 6),
 * CSRs record approvals received by email/phone here; the e-signature
 * record comes with the portal.
 */
export async function resolveProof(
  proofId: string,
  decision: "APPROVED" | "REJECTED",
  comment?: string,
): Promise<ActionResult> {
  const { orgId, userId } = await requireOrg();
  const db = tenantDb(orgId);

  const proof = await db.proof.update({
    where: { id: proofId },
    data: {
      status: decision,
      respondedAt: new Date(),
      clientComment: comment || null,
    },
  });
  const job = await db.job.findUniqueOrThrow({ where: { id: proof.jobId } });

  if (decision === "APPROVED") {
    await db.job.update({
      where: { id: proof.jobId },
      data: { status: "PREPRESS" },
    });
  }
  await db.activityLog.create({
    data: {
      organizationId: orgId,
      type: decision === "APPROVED" ? "PROOF_APPROVED" : "PROOF_REJECTED",
      summary: `Proof ${decision.toLowerCase()} for job #${job.jobNumber}${comment ? ` — "${comment}"` : ""}`,
      jobId: proof.jobId,
      contactId: proof.contactId,
      actorId: userId,
    },
  });

  revalidatePath(`/jobs/${proof.jobId}`);
  return actionOk;
}
