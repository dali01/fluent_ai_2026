"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";
import { LEAD_STAGES, leadSchema } from "@/lib/validation/crm";
import { type ActionResult, actionOk, idOrNull, parseForm } from "./form";

export async function createLead(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const { data, result } = parseForm(leadSchema, formData);
  if (!data) return result!;

  await tenantDb(orgId).lead.create({
    data: {
      organizationId: orgId,
      title: data.title,
      stage: data.stage,
      companyId: idOrNull(data.companyId),
      contactId: idOrNull(data.contactId),
      value: data.value,
      source: data.source || null,
      notes: data.notes || null,
    },
  });

  revalidatePath("/pipeline");
  return actionOk;
}

/** Kanban drag-and-drop stage move. */
export async function moveLeadStage(
  leadId: string,
  stage: string,
): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  if (!(LEAD_STAGES as readonly string[]).includes(stage)) {
    return { ok: false, error: `Unknown stage: ${stage}` };
  }

  await tenantDb(orgId).lead.update({
    where: { id: leadId },
    data: { stage: stage as (typeof LEAD_STAGES)[number] },
  });

  revalidatePath("/pipeline");
  return actionOk;
}

export async function archiveLead(leadId: string): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  await tenantDb(orgId).lead.update({
    where: { id: leadId },
    data: { deletedAt: new Date() },
  });
  revalidatePath("/pipeline");
  return actionOk;
}
