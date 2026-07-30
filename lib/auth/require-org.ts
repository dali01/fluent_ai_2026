import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export type OrgContext = {
  userId: string;
  orgId: string;
  /** Clerk org role, e.g. "org:admin" or "org:member". */
  orgRole: string;
};

/**
 * Guard for org-scoped server components, server actions and route handlers.
 *
 * Redirects to sign-in when unauthenticated and to the organization picker
 * when no organization is active. Everything tenant-scoped must start here —
 * the returned orgId is the tenant key for the data-access layer (Phase 1).
 */
export async function requireOrg(): Promise<OrgContext> {
  const { userId, orgId, orgRole } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }
  if (!orgId) {
    redirect("/select-org");
  }

  return { userId, orgId, orgRole: orgRole ?? "org:member" };
}
