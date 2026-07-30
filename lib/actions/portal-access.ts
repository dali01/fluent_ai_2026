"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";

/** Generate (or rotate) a contact's portal token; returns the portal path. */
export async function generatePortalLink(
  contactId: string,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const { orgId } = await requireOrg();
  const db = tenantDb(orgId);

  const contact = await db.contact.findUnique({ where: { id: contactId } });
  if (!contact || contact.deletedAt) {
    return { ok: false, error: "Contact not found" };
  }
  if (!contact.companyId) {
    return { ok: false, error: "Contact needs a company for portal access" };
  }

  const token = randomBytes(24).toString("base64url");
  await db.contact.update({
    where: { id: contactId },
    data: { portalToken: token },
  });

  revalidatePath(`/contacts/${contactId}`);
  return { ok: true, path: `/portal/${token}` };
}

export async function revokePortalLink(contactId: string): Promise<void> {
  const { orgId } = await requireOrg();
  await tenantDb(orgId).contact.update({
    where: { id: contactId },
    data: { portalToken: null },
  });
  revalidatePath(`/contacts/${contactId}`);
}
