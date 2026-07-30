import { getDb } from "@/lib/db/client";
import { tenantDb, type TenantDb } from "@/lib/db/tenant";

export type PortalContext = {
  db: TenantDb;
  orgId: string;
  orgName: string;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
  };
  company: { id: string; name: string };
};

/**
 * Resolve a portal bearer token to its tenant context, or null.
 *
 * The token lookup is the ONE place the portal touches the raw client
 * (tokens are globally unique, the org isn't known yet); everything after
 * goes through tenantDb for the resolved org. Contacts without a company
 * get no portal — there is nothing to show them.
 */
export async function resolvePortalToken(
  token: string,
): Promise<PortalContext | null> {
  if (!token || token.length < 20) return null;

  const contact = await getDb().contact.findUnique({
    where: { portalToken: token },
    include: {
      company: { select: { id: true, name: true } },
      organization: { select: { id: true, name: true } },
    },
  });
  if (!contact || contact.deletedAt || !contact.company) return null;

  return {
    db: tenantDb(contact.organizationId),
    orgId: contact.organizationId,
    orgName: contact.organization.name,
    contact: {
      id: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
    },
    company: contact.company,
  };
}
