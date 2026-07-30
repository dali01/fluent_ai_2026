/**
 * Per-org fan-out with failure isolation: one org's failure never
 * aborts another's. Job bodies are plain async functions with no
 * Request/Response dependency — the seam for the documented
 * Inngest/Trigger.dev migration.
 */
export async function runPerOrg<T>(
  name: string,
  orgIds: string[],
  fn: (orgId: string) => Promise<T>,
): Promise<{ ok: number; failed: number; results: Array<T | null> }> {
  let ok = 0;
  let failed = 0;
  const results: Array<T | null> = [];

  for (const orgId of orgIds) {
    try {
      results.push(await fn(orgId));
      ok++;
    } catch (error) {
      failed++;
      results.push(null);
      console.error(`[jobs] ${name} failed for org ${orgId}:`, error);
    }
  }

  return { ok, failed, results };
}
