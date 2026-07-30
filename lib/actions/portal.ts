"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { resolvePortalToken } from "@/lib/portal/auth";
import { runPrepressChecks } from "@/lib/prepress/checks";
import { getStorage } from "@/lib/storage";
import type { ActionResult } from "./form";
import { actionOk } from "./form";

const MAX_FILE_BYTES = 40 * 1024 * 1024;

/**
 * Portal actions authenticate via the bearer token, NOT Clerk. Every
 * resource is verified to belong to the token's company before use —
 * a stolen job id from another company (even same org) resolves nothing.
 */

async function signatureRecord(signerName: string, subject: string) {
  const h = await headers();
  const signedAt = new Date().toISOString();
  return {
    signerName,
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown",
    userAgent: h.get("user-agent") ?? "unknown",
    signedAt,
    signatureHash: createHash("sha256")
      .update(`${signerName}|${subject}|${signedAt}`)
      .digest("hex"),
  };
}

export async function portalResolveProof(
  token: string,
  proofId: string,
  decision: "APPROVED" | "REJECTED",
  signerName: string,
  comment: string,
): Promise<ActionResult> {
  const portal = await resolvePortalToken(token);
  if (!portal) return { ok: false, error: "Invalid portal link" };
  if (!signerName.trim()) {
    return { ok: false, error: "Type your full name to sign" };
  }

  const proof = await portal.db.proof.findFirst({
    where: {
      id: proofId,
      status: "SENT",
      job: { companyId: portal.company.id },
    },
    include: { job: true },
  });
  if (!proof)
    return { ok: false, error: "Proof not found or already resolved" };

  const record = await signatureRecord(signerName.trim(), proofId);
  await portal.db.proof.update({
    where: { id: proofId },
    data: {
      status: decision,
      respondedAt: new Date(),
      clientComment: comment.trim() || null,
      signatureRecord: record,
    },
  });
  if (decision === "APPROVED") {
    await portal.db.job.update({
      where: { id: proof.jobId },
      data: { status: "PREPRESS" },
    });
  }
  await portal.db.activityLog.create({
    data: {
      organizationId: portal.orgId,
      type: decision === "APPROVED" ? "PROOF_APPROVED" : "PROOF_REJECTED",
      summary: `Proof ${decision.toLowerCase()} via portal by ${record.signerName} (e-signed)${comment ? ` — "${comment.trim()}"` : ""}`,
      jobId: proof.jobId,
      contactId: portal.contact.id,
    },
  });

  revalidatePath(`/portal/${token}`);
  return actionOk;
}

export async function portalUploadFile(
  token: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const portal = await resolvePortalToken(token);
  if (!portal) return { ok: false, error: "Invalid portal link" };

  const jobId = String(formData.get("jobId") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file to upload" };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: "File is larger than 40 MB" };
  }

  const job = await portal.db.job.findFirst({
    where: { id: jobId, companyId: portal.company.id, deletedAt: null },
  });
  if (!job) return { ok: false, error: "Order not found" };

  const buffer = Buffer.from(await file.arrayBuffer());
  const prepress = await runPrepressChecks(buffer, file.type, file.name, {
    widthMm: job.widthMm ? Number(job.widthMm) : null,
    heightMm: job.heightMm ? Number(job.heightMm) : null,
    bleedMm: job.bleedMm ? Number(job.bleedMm) : null,
  });

  const latest = await portal.db.jobFile.findFirst({
    where: { jobId, fileName: file.name },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (latest?.version ?? 0) + 1;
  const safeName = file.name.replaceAll(/[^\w.\-()\s]/g, "_");
  const key = `${portal.orgId}/${jobId}/v${version}-${safeName}`;
  await getStorage().put(key, buffer, {
    contentType: file.type || "application/octet-stream",
  });

  await portal.db.jobFile.create({
    data: {
      organizationId: portal.orgId,
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
      uploadedById: null, // client upload
    },
  });
  await portal.db.activityLog.create({
    data: {
      organizationId: portal.orgId,
      type: "FILE_UPLOADED",
      summary: `Client uploaded "${file.name}" v${version} to job #${job.jobNumber} via portal — prepress ${prepress.verdict}`,
      jobId,
      contactId: portal.contact.id,
    },
  });

  revalidatePath(`/portal/${token}`);
  return actionOk;
}

/** Storefront: reorder a completed job. Lands as a new DESIGN job. */
export async function portalReorder(
  token: string,
  jobId: string,
): Promise<ActionResult> {
  const portal = await resolvePortalToken(token);
  if (!portal) return { ok: false, error: "Invalid portal link" };

  const source = await portal.db.job.findFirst({
    where: {
      id: jobId,
      companyId: portal.company.id,
      status: "DONE",
      deletedAt: null,
    },
  });
  if (!source) return { ok: false, error: "Order not found" };

  const max = await portal.db.job.aggregate({ _max: { jobNumber: true } });
  const clone = await portal.db.job.create({
    data: {
      organizationId: portal.orgId,
      jobNumber: (max._max.jobNumber ?? 2000) + 1,
      title: source.title,
      companyId: source.companyId,
      status: "DESIGN",
      stock: source.stock,
      sizeName: source.sizeName,
      widthMm: source.widthMm,
      heightMm: source.heightMm,
      colorMode: source.colorMode,
      finish: source.finish,
      binding: source.binding,
      quantity: source.quantity,
      bleedMm: source.bleedMm,
    },
  });
  await portal.db.activityLog.create({
    data: {
      organizationId: portal.orgId,
      type: "SYSTEM",
      summary: `Client reordered #${source.jobNumber} via portal → job #${clone.jobNumber}`,
      jobId: clone.id,
      contactId: portal.contact.id,
    },
  });

  revalidatePath(`/portal/${token}`);
  return actionOk;
}
