import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { isAiEnabled } from "@/lib/ai/client";
import { narrateBriefing } from "@/lib/ai/briefing";
import { readGeneralConfig } from "@/lib/db/org-settings";
import { buildOwnerBriefing } from "@/lib/insights/briefing";
import { isAuthorizedCronRequest } from "@/lib/jobs/cron";
import { listActiveOrgIds } from "@/lib/jobs/orgs";
import { runPerOrg } from "@/lib/jobs/run";
import { sendEmailSafe } from "@/lib/notifications";
import { ownerBriefingEmail } from "@/lib/notifications/templates";

/**
 * Monday owner briefing (docs/ai-roadmap.md §1.2). Same posture as the
 * other crons: 404 on a bad secret, 200 with { ok: false } on failure.
 *
 * Recipients are the org's Clerk admins — Organization has no owner
 * email field, and inventing one would be a schema change for a
 * question Clerk already answers.
 */
export const maxDuration = 300;

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!isAiEnabled()) {
    return NextResponse.json({ ok: true, skipped: "AI not configured" });
  }

  const orgIds = await listActiveOrgIds();
  const summary = await runPerOrg("briefing", orgIds, async (orgId) => {
    const client = await clerkClient();
    const [organization, memberships, general] = await Promise.all([
      client.organizations
        .getOrganization({ organizationId: orgId })
        .catch(() => null),
      client.organizations
        .getOrganizationMembershipList({ organizationId: orgId, limit: 50 })
        .catch(() => ({ data: [] })),
      readGeneralConfig(orgId),
    ]);

    const recipients = memberships.data
      .filter((m) => m.role === "org:admin")
      .map((m) => m.publicUserData?.identifier)
      .filter((email): email is string => Boolean(email?.includes("@")));

    if (recipients.length === 0) {
      return { orgId, sent: 0, reason: "no admin email" };
    }

    const data = await buildOwnerBriefing(orgId);
    const narrated = await narrateBriefing(
      orgId,
      organization?.name ?? "Your print shop",
      data,
      general.currency,
    );
    if (!narrated) return { orgId, sent: 0, reason: "AI unavailable" };

    const email = ownerBriefingEmail({
      orgName: organization?.name ?? "Your print shop",
      weekOf: data.weekOf,
      headline: narrated.headline,
      narrative: narrated.narrative,
      actions: narrated.actions,
      appUrl: BASE_URL,
    });

    let sent = 0;
    for (const to of recipients) {
      if (await sendEmailSafe({ to, ...email })) sent++;
    }
    return { orgId, sent, headline: narrated.headline };
  });

  return NextResponse.json({
    ok: summary.failed === 0,
    orgs: summary.results.filter(Boolean),
  });
}
