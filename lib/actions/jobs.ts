"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";
import type { JobStatus } from "@/lib/generated/prisma/enums";
import { notifyJobStatus } from "@/lib/notifications/notify";
import { JOB_STATUSES, jobSchema } from "@/lib/validation/jobs";
import { type ActionResult, actionOk, idOrNull, parseForm } from "./form";

const FORM_OPTIONS = { booleans: ["rush"] };

/** Next job number for the org — max+1 inside a transaction. Gap-tolerant. */
async function nextJobNumber(orgId: string): Promise<number> {
  const agg = await tenantDb(orgId).job.aggregate({
    _max: { jobNumber: true },
  });
  return (agg._max.jobNumber ?? 2000) + 1;
}

function jobDataFromInput(data: ReturnType<typeof jobSchema.parse>) {
  return {
    title: data.title,
    companyId: data.companyId,
    status: data.status,
    pressId: idOrNull(data.pressId),
    stock: data.stock || null,
    sizeName: data.sizeName || null,
    widthMm: data.widthMm ?? null,
    heightMm: data.heightMm ?? null,
    colorMode: data.colorMode,
    finish: data.finish || null,
    binding: data.binding || null,
    quantity: data.quantity,
    bleedMm: data.bleedMm ?? null,
    rush: data.rush,
    dueDate: data.dueDate ? new Date(data.dueDate) : null,
    notes: data.notes || null,
  };
}

export async function createJob(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { orgId, userId } = await requireOrg();
  const { data, result } = parseForm(jobSchema, formData, FORM_OPTIONS);
  if (!data) return result!;

  const db = tenantDb(orgId);
  const job = await db.job.create({
    data: {
      organizationId: orgId,
      jobNumber: await nextJobNumber(orgId),
      ...jobDataFromInput(data),
    },
  });
  await db.activityLog.create({
    data: {
      organizationId: orgId,
      type: "SYSTEM",
      summary: `Job #${job.jobNumber} "${job.title}" created`,
      jobId: job.id,
      actorId: userId,
    },
  });
  // Opening event (from null) — without it, time spent in the first
  // status would have no start and cycle time would begin at the second
  // transition.
  await recordStatusChange({
    orgId,
    jobId: job.id,
    from: null,
    to: job.status,
    actorId: userId,
    deliveredAt: null,
  });

  revalidatePath("/jobs");
  redirect(`/jobs/${job.id}`);
}

/**
 * The ONE place a status transition is recorded. Both writers below call
 * it — the edit form used to change status with no log at all, which
 * made cycle time unmeasurable for anything but board drags
 * (docs/ai-roadmap.md). Also stamps deliveredAt on first completion:
 * dueDate is the promise, deliveredAt is what happened.
 */
async function recordStatusChange(options: {
  orgId: string;
  jobId: string;
  from: JobStatus | null;
  to: JobStatus;
  actorId: string | null;
  deliveredAt: Date | null;
}): Promise<void> {
  const { orgId, jobId, from, to, actorId, deliveredAt } = options;
  if (from === to) return;

  const db = tenantDb(orgId);
  await db.jobStatusEvent.create({
    data: {
      organizationId: orgId,
      jobId,
      fromStatus: from,
      toStatus: to,
      actorId,
    },
  });

  // First completion only — re-entering DONE must not move the date
  if (to === "DONE" && !deliveredAt) {
    await db.job.update({
      where: { id: jobId },
      data: { deliveredAt: new Date() },
    });
  }
}

export async function updateJob(
  jobId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { orgId, userId } = await requireOrg();
  const { data, result } = parseForm(jobSchema, formData, FORM_OPTIONS);
  if (!data) return result!;

  const db = tenantDb(orgId);
  const before = await db.job.findUniqueOrThrow({
    where: { id: jobId },
    select: { status: true, jobNumber: true, deliveredAt: true },
  });
  const job = await db.job.update({
    where: { id: jobId },
    data: jobDataFromInput(data),
  });

  if (job.status !== before.status) {
    await recordStatusChange({
      orgId,
      jobId,
      from: before.status,
      to: job.status,
      actorId: userId,
      deliveredAt: before.deliveredAt,
    });
    await db.activityLog.create({
      data: {
        organizationId: orgId,
        type: "STATUS_CHANGE",
        summary: `Job #${job.jobNumber} moved to ${job.status}`,
        jobId,
        actorId: userId,
      },
    });
    if (job.status === "DONE") {
      await consumeJobMaterials(orgId, jobId, job.jobNumber, userId);
    }
  }

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  return actionOk;
}

/** Production board drag-and-drop. */
export async function moveJobStatus(
  jobId: string,
  status: string,
): Promise<ActionResult> {
  const { orgId, userId } = await requireOrg();
  if (!(JOB_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: `Unknown status: ${status}` };
  }

  const db = tenantDb(orgId);
  const before = await db.job.findUniqueOrThrow({
    where: { id: jobId },
    select: { status: true, deliveredAt: true },
  });
  const job = await db.job.update({
    where: { id: jobId },
    data: { status: status as (typeof JOB_STATUSES)[number] },
  });
  await recordStatusChange({
    orgId,
    jobId,
    from: before.status,
    to: job.status,
    actorId: userId,
    deliveredAt: before.deliveredAt,
  });
  await db.activityLog.create({
    data: {
      organizationId: orgId,
      type: "STATUS_CHANGE",
      summary: `Job #${job.jobNumber} moved to ${status}`,
      jobId,
      actorId: userId,
    },
  });

  if (status === "DONE") {
    await consumeJobMaterials(orgId, jobId, job.jobNumber, userId);
  }

  const { clerkClient } = await import("@clerk/nextjs/server");
  const organization = await (
    await clerkClient()
  ).organizations
    .getOrganization({ organizationId: orgId })
    .catch(() => null);
  await notifyJobStatus(
    orgId,
    organization?.name ?? "Your print shop",
    job,
    status,
  );

  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/inventory");
  return actionOk;
}

/**
 * Auto-deduct on completion: turn planned materials into JOB_CONSUMPTION
 * movements. Idempotent — an item already consumed for this job is
 * skipped, so re-entering DONE never double-deducts. Stock may go
 * negative here by design (the print run already happened; the ledger
 * must reflect reality) — the low-stock alert catches it.
 */
async function consumeJobMaterials(
  orgId: string,
  jobId: string,
  jobNumber: number,
  userId: string,
): Promise<void> {
  const db = tenantDb(orgId);
  const [materials, existing] = await Promise.all([
    db.jobMaterial.findMany({
      where: { jobId },
      include: { inventoryItem: { select: { name: true, unit: true } } },
    }),
    db.stockMovement.findMany({
      where: { jobId, reason: "JOB_CONSUMPTION" },
      select: { inventoryItemId: true },
    }),
  ]);
  const consumed = new Set(existing.map((m) => m.inventoryItemId));
  const pending = materials.filter((m) => !consumed.has(m.inventoryItemId));
  if (pending.length === 0) return;

  for (const material of pending) {
    await db.stockMovement.create({
      data: {
        organizationId: orgId,
        inventoryItemId: material.inventoryItemId,
        jobId,
        delta: -Number(material.quantityPlanned),
        reason: "JOB_CONSUMPTION",
        note: `Auto-deduct on job #${jobNumber} completion`,
      },
    });
    await db.inventoryItem.update({
      where: { id: material.inventoryItemId },
      data: { quantityOnHand: { decrement: material.quantityPlanned } },
    });
  }
  await db.activityLog.create({
    data: {
      organizationId: orgId,
      type: "SYSTEM",
      summary: `Job #${jobNumber} done — ${pending.length} material(s) deducted from stock`,
      jobId,
      actorId: userId,
    },
  });
}

/** One-click reorder: clone specs into a fresh job in DESIGN. */
export async function reorderJob(jobId: string): Promise<void> {
  const { orgId, userId } = await requireOrg();
  const db = tenantDb(orgId);

  const source = await db.job.findUniqueOrThrow({ where: { id: jobId } });
  const jobNumber = await nextJobNumber(orgId);
  const clone = await db.job.create({
    data: {
      organizationId: orgId,
      jobNumber,
      title: source.title,
      companyId: source.companyId,
      status: "DESIGN",
      pressId: source.pressId,
      stock: source.stock,
      sizeName: source.sizeName,
      widthMm: source.widthMm,
      heightMm: source.heightMm,
      colorMode: source.colorMode,
      finish: source.finish,
      binding: source.binding,
      quantity: source.quantity,
      bleedMm: source.bleedMm,
      notes: source.notes,
    },
  });
  await db.activityLog.create({
    data: {
      organizationId: orgId,
      type: "SYSTEM",
      summary: `Job #${clone.jobNumber} created as reorder of #${source.jobNumber}`,
      jobId: clone.id,
      actorId: userId,
    },
  });

  revalidatePath("/jobs");
  redirect(`/jobs/${clone.id}`);
}

export async function archiveJob(jobId: string): Promise<void> {
  const { orgId } = await requireOrg();
  await tenantDb(orgId).job.update({
    where: { id: jobId },
    data: { deletedAt: new Date() },
  });
  revalidatePath("/jobs");
  redirect("/jobs");
}
