import { NextResponse } from "next/server";
import { z } from "zod";
import { isAiEnabled } from "@/lib/ai/client";
import { answerPortalChat, type ChatTurn } from "@/lib/ai/portal-chat";
import { readGeneralConfig } from "@/lib/db/org-settings";
import { resolvePortalToken } from "@/lib/portal/auth";

/**
 * Portal chatbot endpoint — bearer-token auth like every portal
 * surface (404 on a bad token, matching the files route). The context
 * snapshot is assembled HERE from the token's company only; the model
 * never sees another tenant's — or another customer's — rows.
 */

const bodySchema = z.object({
  token: z.string().min(20).max(200),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(20),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const portal = await resolvePortalToken(parsed.data.token);
  if (!portal) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!isAiEnabled()) {
    return NextResponse.json(
      { error: "Chat is not available right now" },
      { status: 503 },
    );
  }

  const companyId = portal.company.id;
  const [general, quotes, jobs, invoices] = await Promise.all([
    readGeneralConfig(portal.orgId),
    portal.db.quote.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: { in: ["SENT", "ACCEPTED", "CONVERTED"] },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        quoteNumber: true,
        status: true,
        total: true,
        validUntil: true,
        notes: true,
        lineItems: {
          select: { description: true, quantity: true, total: true },
        },
      },
    }),
    portal.db.job.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 15,
      select: {
        jobNumber: true,
        title: true,
        status: true,
        quantity: true,
        dueDate: true,
        rush: true,
      },
    }),
    portal.db.invoice.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        invoiceNumber: true,
        status: true,
        total: true,
        dueDate: true,
      },
    }),
  ]);

  try {
    const answer = await answerPortalChat({
      orgId: portal.orgId,
      orgName: portal.orgName,
      companyName: portal.company.name,
      contactFirstName: portal.contact.firstName,
      context: JSON.parse(
        JSON.stringify({
          currency: general.currency,
          quotes,
          jobsInProduction: jobs,
          openInvoices: invoices,
        }),
      ),
      messages: parsed.data.messages as ChatTurn[],
    });
    if (!answer) {
      return NextResponse.json(
        { error: "Chat is not available right now" },
        { status: 503 },
      );
    }
    return NextResponse.json({ answer });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong — please try again" },
      { status: 500 },
    );
  }
}
