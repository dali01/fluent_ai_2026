"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";
import { jobMaterialSchema } from "@/lib/validation/inventory";
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
