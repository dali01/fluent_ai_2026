import { NextResponse } from "next/server";
import { z } from "zod";
import { isAiEnabled } from "@/lib/ai/client";
import { extractRfq } from "@/lib/ai/rfq";
import { resolvePortalToken } from "@/lib/portal/auth";

/**
 * Portal chat → quote request (docs/ai-roadmap.md Tier 3).
 *
 * The chatbot is read-only and stays that way. This is a SEPARATE,
 * customer-initiated action: they press "Request a quote", we extract a
 * spec from what they wrote, and a Lead lands in the shop's pipeline as
 * QUOTE_REQUESTED for a human to price. Nothing is quoted, promised or
 * priced here — the customer is raising their hand, not buying.
 */

const bodySchema = z.object({
  token: z.string().min(20).max(200),
  message: z.string().min(10).max(4000),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const portal = await resolvePortalToken(parsed.data.token);
  if (!portal) return new NextResponse("Not found", { status: 404 });
  if (!isAiEnabled()) {
    return NextResponse.json(
      { error: "Quote requests are unavailable right now" },
      { status: 503 },
    );
  }

  let extraction = null;
  try {
    extraction = await extractRfq({
      orgId: portal.orgId,
      text: parsed.data.message,
      // The customer is known — no need to guess who they are
      knownCompanies: [portal.company.name],
    });
  } catch {
    extraction = null;
  }

  // The lead is created even when extraction fails: a customer asking
  // for a quote must never be dropped because a model call did.
  const summary =
    extraction?.lines
      .map((l) => `${l.quantity} × ${l.description}`)
      .join("; ") ?? "See the request text";

  const lead = await portal.db.lead.create({
    data: {
      organizationId: portal.orgId,
      title: `Portal quote request — ${portal.company.name}`,
      stage: "QUOTE_REQUESTED",
      companyId: portal.company.id,
      contactId: portal.contact.id,
      source: "portal",
      notes: `${parsed.data.message}\n\n— extracted: ${summary}`,
      signal: extraction
        ? JSON.parse(JSON.stringify(extraction))
        : { raw: parsed.data.message },
    },
  });

  await portal.db.activityLog.create({
    data: {
      organizationId: portal.orgId,
      type: "NOTE",
      summary: `Quote requested from the portal by ${portal.contact.firstName} ${portal.contact.lastName}: ${summary}`,
      contactId: portal.contact.id,
    },
  });

  return NextResponse.json({
    ok: true,
    leadId: lead.id,
    // Shown back to the customer so they can see what was understood
    understood: extraction
      ? {
          lines: extraction.lines.map((l) => ({
            description: l.description,
            quantity: l.quantity,
          })),
          clarifications: extraction.clarifications,
        }
      : null,
  });
}
