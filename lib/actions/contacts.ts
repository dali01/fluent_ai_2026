"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";
import { contactSchema } from "@/lib/validation/crm";
import { type ActionResult, actionOk, idOrNull, parseForm } from "./form";

const FORM_OPTIONS = { tagFields: ["tags"] };

export async function createContact(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const { data, result } = parseForm(contactSchema, formData, FORM_OPTIONS);
  if (!data) return result!;

  const contact = await tenantDb(orgId).contact.create({
    data: {
      organizationId: orgId,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email || null,
      phone: data.phone || null,
      title: data.title || null,
      companyId: idOrNull(data.companyId),
      notes: data.notes || null,
      tags: data.tags,
    },
  });

  revalidatePath("/contacts");
  redirect(`/contacts/${contact.id}`);
}

export async function updateContact(
  contactId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const { data, result } = parseForm(contactSchema, formData, FORM_OPTIONS);
  if (!data) return result!;

  await tenantDb(orgId).contact.update({
    where: { id: contactId },
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email || null,
      phone: data.phone || null,
      title: data.title || null,
      companyId: idOrNull(data.companyId),
      notes: data.notes || null,
      tags: data.tags,
    },
  });

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
  return actionOk;
}

export async function archiveContact(contactId: string): Promise<void> {
  const { orgId } = await requireOrg();
  await tenantDb(orgId).contact.update({
    where: { id: contactId },
    data: { deletedAt: new Date() },
  });
  revalidatePath("/contacts");
  redirect("/contacts");
}
