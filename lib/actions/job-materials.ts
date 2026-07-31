"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";
import {
  actualUsageSchema,
  jobMaterialSchema,
} from "@/lib/validation/inventory";
import { type ActionResult, actionOk, parseForm } from "./form";

export async function addJobMaterial(
  jobId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const { data, result } = parseForm(jobMaterialSchema, formData);
  if (!data) return result!;

  const db = tenantDb(orgId);
  await db.jobMaterial.upsert({
    where: {
      jobId_inventoryItemId: { jobId, inventoryItemId: data.inventoryItemId },
    },
    create: {
      organizationId: orgId,
      jobId,
      inventoryItemId: data.inventoryItemId,
      quantityPlanned: data.quantityPlanned,
    },
    update: { quantityPlanned: data.quantityPlanned },
  });

  revalidatePath(`/jobs/${jobId}`);
  return actionOk;
}

export async function removeJobMaterial(
  jobId: string,
  materialId: string,
): Promise<void> {
  const { orgId } = await requireOrg();
  await tenantDb(orgId).jobMaterial.delete({ where: { id: materialId } });
  revalidatePath(`/jobs/${jobId}`);
}

/**
 * Record what a run actually consumed. Optional by design — waste stays
 * an estimate until someone bothers, and the UI says so (option 2 of the
 * waste decision, docs/ai-roadmap.md §2.3).
 *
 * The stock ledger is corrected by the difference rather than rewritten:
 * the original JOB_CONSUMPTION movement is history, so an over-run posts
 * an extra WASTE movement and an under-run posts a RETURN.
 */
export async function recordActualUsage(
  jobId: string,
  materialId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { orgId, userId } = await requireOrg();
  const { data, result } = parseForm(actualUsageSchema, formData);
  if (!data) return result!;

  const db = tenantDb(orgId);
  const material = await db.jobMaterial.findUniqueOrThrow({
    where: { id: materialId },
    include: {
      inventoryItem: { select: { id: true, name: true } },
      job: { select: { jobNumber: true } },
    },
  });

  const planned = Number(material.quantityPlanned);
  const previouslyRecorded = material.quantityActual
    ? Number(material.quantityActual)
    : planned;
  const delta = data.quantityActual - previouslyRecorded;

  await db.jobMaterial.update({
    where: { id: materialId },
    data: {
      quantityActual: data.quantityActual,
      quantitySpoiled: data.quantitySpoiled ?? null,
    },
  });

  if (Math.abs(delta) > 0.0001) {
    await db.stockMovement.create({
      data: {
        organizationId: orgId,
        inventoryItemId: material.inventoryItemId,
        jobId,
        delta: -delta, // consuming more removes more stock
        reason: delta > 0 ? "WASTE" : "RETURN",
        note: `Actual usage recorded for job #${material.job.jobNumber} (planned ${planned})`,
      },
    });
    await db.inventoryItem.update({
      where: { id: material.inventoryItemId },
      data: { quantityOnHand: { decrement: delta } },
    });
  }

  await db.activityLog.create({
    data: {
      organizationId: orgId,
      type: "SYSTEM",
      summary: `Actual usage for job #${material.job.jobNumber}: ${data.quantityActual} of ${material.inventoryItem.name} (planned ${planned}${data.quantitySpoiled ? `, ${data.quantitySpoiled} spoiled` : ""})`,
      jobId,
      actorId: userId,
    },
  });

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/inventory");
  return actionOk;
}
