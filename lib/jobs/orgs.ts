import { getDb } from "@/lib/db/client";

/**
 * Enumerate tenants for cron fan-out. This is the ONE place background
 * jobs touch the raw client for Organization (the second documented
 * getDb() exception after lib/portal/auth.ts): cron has no Clerk
 * session, so requireOrg() is unusable, and Organization is refused by
 * the tenant client — there is no tenant-scoped way to list tenants.
 */
export async function listActiveOrgIds(): Promise<string[]> {
  const orgs = await getDb().organization.findMany({
    select: { id: true },
  });
  return orgs.map((o) => o.id);
}
