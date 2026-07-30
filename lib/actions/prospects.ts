"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { draftOutreach, type OutreachDraft } from "@/lib/ai/outreach";
import { isAiEnabled } from "@/lib/ai/client";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";
import { enrichSafe } from "@/lib/prospecting/enrichment";
import { runProspectSource } from "@/lib/prospecting/pipeline";
import { isSourceId } from "@/lib/prospecting/sources";
import { type ActionResult, actionOk } from "./form";

/**
 * Prospect actions — the house shape (requireOrg → tenantDb →
 * activityLog → revalidatePath). Qualify creates Company (+Contact when
 * enriched) and moves the lead onto the kanban as QUOTE_REQUESTED.
 */

export async function qualifyProspect(prospectId: string): Promise<void> {
  const { orgId, userId } = await requireOrg();
  const db = tenantDb(orgId);

  const prospect = await db.lead.findUniqueOrThrow({
    where: { id: prospectId },
  });
  if (prospect.stage !== "PROSPECT") {
    throw new Error("Only PROSPECT-stage leads can be qualified");
  }

  const companyName = prospect.notes ?? prospect.title; // notes = business name
  const company = await db.company.create({
    data: {
      organizationId: orgId,
      name: companyName,
      email: prospect.contactEmail ?? null,
      phone: prospect.phone ?? null,
      website: prospect.website ?? null,
      addressLine1: prospect.addressLine1 ?? null,
      city: prospect.city ?? null,
      postalCode: prospect.postalCode ?? null,
      country: prospect.country ?? null,
      tags: ["prospecting"],
    },
  });

  let contactId: string | null = null;
  if (prospect.contactName || prospect.contactEmail) {
    const [firstName, ...rest] = (
      prospect.contactName ?? "Unknown Contact"
    ).split(" ");
    const contact = await db.contact.create({
      data: {
        organizationId: orgId,
        companyId: company.id,
        firstName: firstName || "Unknown",
        lastName: rest.join(" ") || "—",
        email: prospect.contactEmail ?? null,
        phone: prospect.contactPhone ?? null,
        title: prospect.contactTitle ?? null,
        tags: ["prospecting"],
      },
    });
    contactId = contact.id;
  }

  await db.lead.update({
    where: { id: prospectId },
    data: {
      stage: "QUOTE_REQUESTED",
      companyId: company.id,
      contactId,
      title: companyName,
    },
  });
  await db.activityLog.create({
    data: {
      organizationId: orgId,
      type: "SYSTEM",
      summary: `Prospect "${companyName}" qualified → pipeline (company created)`,
      contactId,
      actorId: userId,
    },
  });

  revalidatePath("/prospects");
  revalidatePath("/pipeline");
  redirect(`/companies/${company.id}`);
}

/** DISQUALIFIED, not deletedAt — the row keeps suppressing re-ingestion. */
export async function disqualifyProspect(
  prospectId: string,
): Promise<ActionResult> {
  const { orgId, userId } = await requireOrg();
  const db = tenantDb(orgId);

  const prospect = await db.lead.update({
    where: { id: prospectId },
    data: { stage: "DISQUALIFIED" },
  });
  await db.activityLog.create({
    data: {
      organizationId: orgId,
      type: "SYSTEM",
      summary: `Prospect "${prospect.notes ?? prospect.title}" disqualified`,
      actorId: userId,
    },
  });

  revalidatePath("/prospects");
  return actionOk;
}

export async function enrichProspectNow(
  prospectId: string,
): Promise<ActionResult> {
  const { orgId } = await requireOrg();
  const db = tenantDb(orgId);

  const prospect = await db.lead.findUniqueOrThrow({
    where: { id: prospectId },
  });
  const enriched = await enrichSafe({
    companyName: prospect.notes ?? prospect.title,
    website: prospect.website ?? undefined,
    city: prospect.city ?? undefined,
    country: prospect.country ?? undefined,
  });
  if (!enriched) {
    await db.lead.update({
      where: { id: prospectId },
      data: { enrichmentStatus: "FAILED" },
    });
    return { ok: false, error: "Enrichment returned no contact" };
  }

  await db.lead.update({
    where: { id: prospectId },
    data: {
      contactName: enriched.name ?? null,
      contactEmail: enriched.email ?? null,
      contactPhone: enriched.phone ?? null,
      contactTitle: enriched.title ?? null,
      enrichmentStatus: "ENRICHED",
      enrichmentProvider: enriched.provider,
      enrichedAt: new Date(),
    },
  });

  revalidatePath("/prospects");
  return actionOk;
}

export async function draftProspectOutreach(
  prospectId: string,
): Promise<{ ok: true; draft: OutreachDraft } | { ok: false; error: string }> {
  const { orgId } = await requireOrg();
  if (!isAiEnabled()) {
    return { ok: false, error: "AI is not configured (ANTHROPIC_API_KEY)" };
  }
  const db = tenantDb(orgId);

  const prospect = await db.lead.findUniqueOrThrow({
    where: { id: prospectId },
  });
  const { clerkClient } = await import("@clerk/nextjs/server");
  const organization = await (
    await clerkClient()
  ).organizations
    .getOrganization({ organizationId: orgId })
    .catch(() => null);

  try {
    const draft = await draftOutreach({
      orgId,
      shopName: organization?.name ?? "our print shop",
      prospectName: prospect.notes ?? prospect.title,
      triggerReason: prospect.triggerReason ?? "new business signal",
      source: prospect.prospectSource,
      category: prospect.category,
      city: prospect.city,
      rationale: prospect.rationale,
    });
    if (!draft) return { ok: false, error: "AI unavailable" };
    return { ok: true, draft };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Draft failed",
    };
  }
}

export type RunSourceResult =
  | {
      ok: true;
      status: "SUCCEEDED" | "PARTIAL";
      created: number;
      duplicates: number;
      screenedOut: number;
      fetched: number;
    }
  | { ok: true; status: "SKIPPED"; reason: string }
  | { ok: false; error: string };

/**
 * Manual trigger — calls the SAME function the cron route calls, and
 * reports what actually happened. Returning a bare success for a SKIPPED
 * run made the button look broken (it "worked" and did nothing).
 */
export async function runProspectSourceNow(
  sourceId: string,
): Promise<RunSourceResult> {
  const { orgId } = await requireOrg();
  if (!isSourceId(sourceId)) {
    return { ok: false, error: `Unknown source: ${sourceId}` };
  }

  const result = await runProspectSource(orgId, sourceId);
  revalidatePath("/prospects");

  if (result.status === "FAILED") {
    return { ok: false, error: result.error ?? "Run failed" };
  }
  if (result.status === "SKIPPED") {
    return {
      ok: true,
      status: "SKIPPED",
      reason: result.reason ?? "source unavailable",
    };
  }
  return {
    ok: true,
    status: result.status,
    created: result.created,
    duplicates: result.duplicates,
    screenedOut: result.screenedOut,
    fetched: result.fetched,
  };
}
