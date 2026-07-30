import { getDb } from "./client";
import { scopeTenantArgs } from "./tenant-scope";

/**
 * Tenant-scoped Prisma client — THE only way feature code touches tenant
 * data. Every operation on every model is rewritten by scopeTenantArgs so
 * it can only see/write rows of the given organization; cross-tenant
 * references throw TenantIsolationError.
 *
 * Usage (orgId always comes from requireOrg(), never from user input):
 *   const { orgId } = await requireOrg();
 *   const db = tenantDb(orgId);
 *   const contacts = await db.contact.findMany({ where: { ... } });
 */
export function tenantDb(organizationId: string) {
  if (!organizationId) {
    throw new Error("tenantDb requires an organizationId");
  }
  return getDb().$extends({
    name: `tenant:${organizationId}`,
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          return query(
            scopeTenantArgs(
              model,
              operation,
              args as Record<string, unknown>,
              organizationId,
            ) as typeof args,
          );
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantDb>;
