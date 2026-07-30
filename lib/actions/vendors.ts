"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";
import { vendorSchema } from "@/lib/validation/inventory";
import { type ActionResult, actionOk, parseForm } from "./form";

export async function saveVendor(
  vendorId: string | null,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const { data, result } = parseForm(vendorSchema, formData);
  if (!data) return result!;

  const db = tenantDb(orgId);
  const fields = {
    name: data.name,
    email: data.email || null,
    phone: data.phone || null,
    services: data.services || null,
    notes: data.notes || null,
  };
  if (vendorId) {
    await db.vendor.update({ where: { id: vendorId }, data: fields });
  } else {
    await db.vendor.create({ data: { organizationId: orgId, ...fields } });
  }

  revalidatePath("/vendors");
  return actionOk;
}

export async function archiveVendor(vendorId: string): Promise<void> {
  const { orgId } = await requireOrg();
  await tenantDb(orgId).vendor.update({
    where: { id: vendorId },
    data: { deletedAt: new Date() },
  });
  revalidatePath("/vendors");
}
