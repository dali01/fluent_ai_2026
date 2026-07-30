"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";
import { companySchema } from "@/lib/validation/crm";
import { type ActionResult, actionOk, idOrNull, parseForm } from "./form";

const FORM_OPTIONS = { booleans: ["isReseller"], tagFields: ["tags"] };

export async function createCompany(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const { data, result } = parseForm(companySchema, formData, FORM_OPTIONS);
  if (!data) return result!;

  const company = await tenantDb(orgId).company.create({
    data: {
      organizationId: orgId,
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      website: data.website || null,
      city: data.city || null,
      country: data.country || null,
      isReseller: data.isReseller,
      priceTierId: idOrNull(data.priceTierId),
      notes: data.notes || null,
      tags: data.tags,
    },
  });

  revalidatePath("/companies");
  redirect(`/companies/${company.id}`);
}

export async function updateCompany(
  companyId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const { data, result } = parseForm(companySchema, formData, FORM_OPTIONS);
  if (!data) return result!;

  await tenantDb(orgId).company.update({
    where: { id: companyId },
    data: {
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      website: data.website || null,
      city: data.city || null,
      country: data.country || null,
      isReseller: data.isReseller,
      priceTierId: idOrNull(data.priceTierId),
      notes: data.notes || null,
      tags: data.tags,
    },
  });

  revalidatePath("/companies");
  revalidatePath(`/companies/${companyId}`);
  return actionOk;
}

export async function archiveCompany(companyId: string): Promise<void> {
  const { orgId } = await requireOrg();
  await tenantDb(orgId).company.update({
    where: { id: companyId },
    data: { deletedAt: new Date() },
  });
  revalidatePath("/companies");
  redirect("/companies");
}
