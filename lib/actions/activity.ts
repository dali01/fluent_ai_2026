"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";
import { activityLogSchema } from "@/lib/validation/crm";
import { type ActionResult, actionOk, idOrNull, parseForm } from "./form";

/** Log a communication/note against a contact (and optionally a job). */
export async function logActivity(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { orgId, userId } = await requireOrg();
  const { data, result } = parseForm(activityLogSchema, formData);
  if (!data) return result!;

  await tenantDb(orgId).activityLog.create({
    data: {
      organizationId: orgId,
      type: data.type,
      summary: data.summary,
      contactId: idOrNull(data.contactId),
      jobId: idOrNull(data.jobId),
      actorId: userId,
    },
  });

  if (data.contactId) revalidatePath(`/contacts/${data.contactId}`);
  return actionOk;
}
