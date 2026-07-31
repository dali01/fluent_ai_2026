import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/jobs/cron";
import { listActiveOrgIds } from "@/lib/jobs/orgs";
import { runPerOrg } from "@/lib/jobs/run";
import { runProspectSource } from "@/lib/prospecting/pipeline";
import { isSourceId } from "@/lib/prospecting/sources";
import type { SourceResult } from "@/lib/prospecting/sources/types";

/**
 * One route, one schedule per source (vercel.json). Three non-obvious
 * choices (docs/prospecting.md §8):
 *  - 404 (not 401) on a bad secret — hide existence, matching the files
 *    route.
 *  - HTTP 200 with { ok: false } on a failed run — a 5xx makes Vercel
 *    Cron retry, turning a bad upstream into a retry storm. Visibility
 *    lives in SourceRun and the ActivityLog, not the status code.
 *  - a long maxDuration: a run fans out across every org and some
 *    upstreams (Overpass) queue requests for tens of seconds. The
 *    default 15s budget killed the OSM agent's socket in production
 *    while it worked locally.
 */
export const maxDuration = 300;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ source: string }> },
) {
  if (!isAuthorizedCronRequest(request)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { source } = await params;
  if (!isSourceId(source)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const orgIds = await listActiveOrgIds();

  // shared sources (openFDA): first org fetches, the rest reuse the batch
  let sharedResult: SourceResult | undefined;
  const summary = await runPerOrg(
    `prospecting:${source}`,
    orgIds,
    async (orgId) => {
      const result = await runProspectSource(orgId, source, { sharedResult });
      if (result.sharedResult) sharedResult = result.sharedResult;
      const { sharedResult: _omit, ...rest } = result;
      return { orgId, ...rest };
    },
  );

  const anyFailed = summary.results.some((r) => r && !r.ok);
  return NextResponse.json({
    ok: !anyFailed && summary.failed === 0,
    source,
    orgs: summary.results.filter(Boolean),
  });
}
