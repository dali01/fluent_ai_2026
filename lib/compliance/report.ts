import { tenantDb } from "@/lib/db/tenant";
import { fetchLabellingRules } from "./federal-register";
import { matchRules, type ComplianceMatch } from "./rules";

/**
 * Fetches recent labelling rules and matches them against this org's
 * customers. Shared across orgs by the caller where possible — the
 * Federal Register is tenant-independent, only the matching is per-org.
 */
export async function buildComplianceRadar(
  orgId: string,
  now: Date = new Date(),
  options: {
    sinceDays?: number;
    rules?: Awaited<ReturnType<typeof fetchLabellingRules>>;
  } = {},
): Promise<ComplianceMatch[]> {
  const rules =
    options.rules ??
    (await fetchLabellingRules({
      since: new Date(now.getTime() - (options.sinceDays ?? 365) * 86_400_000),
      signal: AbortSignal.timeout(30_000),
    }));

  const customers = await tenantDb(orgId).company.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, tags: true },
    take: 1000,
  });

  return matchRules(
    rules,
    customers.map((c) => ({
      companyId: c.id,
      name: c.name,
      tags: c.tags,
    })),
    now,
  );
}
