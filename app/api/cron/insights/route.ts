import { NextResponse } from "next/server";
import { computeLeadScores } from "@/lib/insights/compute";
import { isAuthorizedCronRequest } from "@/lib/jobs/cron";
import { listActiveOrgIds } from "@/lib/jobs/orgs";
import { runPerOrg } from "@/lib/jobs/run";

/**
 * Nightly LeadScore recompute (vercel.json). Same posture as the
 * prospecting crons: 404 on a bad secret, HTTP 200 with { ok: false }
 * on failure so Vercel Cron never retry-storms.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const orgIds = await listActiveOrgIds();
  const summary = await runPerOrg("insights", orgIds, async (orgId) => ({
    orgId,
    ...(await computeLeadScores(orgId)),
  }));

  return NextResponse.json({
    ok: summary.failed === 0,
    orgs: summary.results.filter(Boolean),
  });
}
