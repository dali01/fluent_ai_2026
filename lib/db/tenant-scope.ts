/**
 * Pure tenant-scoping logic — no Prisma client dependency, fully unit-tested.
 *
 * Every operation on a tenant model is rewritten so it can only ever touch
 * rows belonging to the caller's organization:
 *   - reads/counts/aggregates: `where` is AND-ed with { organizationId }
 *   - creates: `data.organizationId` is stamped
 *   - updates/deletes/upserts: `where` is AND-ed AND (for unique wheres)
 *     extended with organizationId (extended-where-unique)
 * Explicitly passing a DIFFERENT organizationId anywhere throws — a loud
 * failure beats silently rewriting what the caller asked for.
 */

export class TenantIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantIsolationError";
  }
}

/** Models that carry organizationId and MUST be tenant-scoped. */
export const TENANT_MODELS = new Set([
  "Membership",
  "Company",
  "Contact",
  "Lead",
  "Job",
  "JobFile",
  "Proof",
  "Quote",
  "QuoteLineItem",
  "PriceTier",
  "PricingRule",
  "InventoryItem",
  "StockMovement",
  "JobMaterial",
  "Press",
  "ScheduleBlock",
  "Vendor",
  "Invoice",
  "Payment",
  "ActivityLog",
  "AiTask",
  "LeadScore",
  "SourceRun",
]);

/** Models the tenant client refuses to touch (use dedicated lib helpers). */
export const GLOBAL_MODELS = new Set(["User"]);

type AnyArgs = Record<string, unknown>;

function assertOrgIdMatches(
  value: unknown,
  organizationId: string,
  location: string,
): void {
  if (value !== undefined && value !== organizationId) {
    throw new TenantIsolationError(
      `Cross-tenant access blocked: ${location} specifies organizationId "${String(
        value,
      )}" but the active organization is "${organizationId}"`,
    );
  }
}

function scopeWhere(
  where: AnyArgs | undefined,
  organizationId: string,
): AnyArgs {
  if (where && "organizationId" in where) {
    assertOrgIdMatches(where.organizationId, organizationId, "where");
  }
  // AND-composition keeps caller filters intact and cannot be overridden by
  // OR branches in the caller's where.
  return where ? { AND: [{ organizationId }, where] } : { organizationId };
}

function stampData(data: AnyArgs, organizationId: string): AnyArgs {
  if ("organizationId" in data) {
    assertOrgIdMatches(data.organizationId, organizationId, "data");
  }
  if ("organization" in data) {
    throw new TenantIsolationError(
      "Cross-tenant access blocked: do not set the organization relation directly; it is stamped from the active organization",
    );
  }
  return { ...data, organizationId };
}

function stampCreateData(
  data: AnyArgs | AnyArgs[],
  organizationId: string,
): AnyArgs | AnyArgs[] {
  return Array.isArray(data)
    ? data.map((d) => stampData(d, organizationId))
    : stampData(data, organizationId);
}

/**
 * Rewrite Prisma operation args so they are scoped to `organizationId`.
 * Throws TenantIsolationError on any attempt to reference another tenant.
 */
export function scopeTenantArgs(
  model: string,
  operation: string,
  args: AnyArgs | undefined,
  organizationId: string,
): AnyArgs {
  if (GLOBAL_MODELS.has(model)) {
    throw new TenantIsolationError(
      `Model ${model} is not tenant-scoped; use the dedicated helpers in lib/db instead of the tenant client`,
    );
  }
  if (model === "Organization") {
    throw new TenantIsolationError(
      "Access the Organization row via lib/db helpers, not the tenant client",
    );
  }
  if (!TENANT_MODELS.has(model)) {
    throw new TenantIsolationError(
      `Model ${model} is unknown to the tenant layer — add it to TENANT_MODELS (and this is a reminder its table needs organizationId)`,
    );
  }

  const a: AnyArgs = { ...(args ?? {}) };

  switch (operation) {
    case "findUnique":
    case "findUniqueOrThrow":
    case "update":
    case "delete":
      // Extended-where-unique: non-unique fields may accompany the unique
      // selector, so the engine itself refuses rows outside the org.
      if (a.where && "organizationId" in (a.where as AnyArgs)) {
        assertOrgIdMatches(
          (a.where as AnyArgs).organizationId,
          organizationId,
          "where",
        );
      }
      a.where = { ...(a.where as AnyArgs), organizationId };
      if (operation === "update") {
        a.data = stampUpdateData(a.data as AnyArgs, organizationId);
      }
      return a;

    case "findFirst":
    case "findFirstOrThrow":
    case "findMany":
    case "count":
    case "aggregate":
    case "groupBy":
    case "deleteMany":
      a.where = scopeWhere(a.where as AnyArgs | undefined, organizationId);
      return a;

    case "updateMany":
    case "updateManyAndReturn":
      a.where = scopeWhere(a.where as AnyArgs | undefined, organizationId);
      a.data = stampUpdateData(a.data as AnyArgs, organizationId);
      return a;

    case "create":
      a.data = stampCreateData(a.data as AnyArgs, organizationId);
      return a;

    case "createMany":
    case "createManyAndReturn":
      a.data = stampCreateData(
        (a.data ?? []) as AnyArgs | AnyArgs[],
        organizationId,
      );
      return a;

    case "upsert":
      if (a.where && "organizationId" in (a.where as AnyArgs)) {
        assertOrgIdMatches(
          (a.where as AnyArgs).organizationId,
          organizationId,
          "where",
        );
      }
      a.where = { ...(a.where as AnyArgs), organizationId };
      a.create = stampData((a.create ?? {}) as AnyArgs, organizationId);
      a.update = stampUpdateData((a.update ?? {}) as AnyArgs, organizationId);
      return a;

    default:
      // Raw queries and any operation added by future Prisma versions are
      // rejected until explicitly supported — fail closed, not open.
      throw new TenantIsolationError(
        `Operation "${operation}" is not supported by the tenant layer`,
      );
  }
}

/** Updates must never move a row to another tenant. */
function stampUpdateData(
  data: AnyArgs | undefined,
  organizationId: string,
): AnyArgs {
  const d = (data ?? {}) as AnyArgs;
  if ("organizationId" in d) {
    const value = d.organizationId;
    const plain = typeof value === "string" ? value : undefined;
    const viaSet =
      value && typeof value === "object" && "set" in (value as AnyArgs)
        ? (value as AnyArgs).set
        : undefined;
    assertOrgIdMatches(plain ?? viaSet, organizationId, "update data");
  }
  if ("organization" in d) {
    throw new TenantIsolationError(
      "Cross-tenant access blocked: updates may not modify the organization relation",
    );
  }
  return d;
}
