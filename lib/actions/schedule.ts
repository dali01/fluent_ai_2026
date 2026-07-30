"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";
import { scheduleBlockSchema } from "@/lib/validation/inventory";
import { type ActionResult, actionOk, idOrNull, parseForm } from "./form";

/**
 * Book press time. Double-booking prevention: overlap check and insert
 * run inside one serializable transaction — a competing booking commits
 * first or forces a retryable failure, never a silent overlap.
 * (Postgres exclusion constraints aren't expressible in Prisma schema;
 * see DECISIONS.md Phase 1.)
 */
export async function createScheduleBlock(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const { orgId, userId } = await requireOrg();
  const { data, result } = parseForm(scheduleBlockSchema, formData);
  if (!data) return result!;

  const db = tenantDb(orgId);
  try {
    await db.$transaction(
      async (tx) => {
        const clash = await tx.scheduleBlock.findFirst({
          where: {
            pressId: data.pressId,
            startsAt: { lt: data.endsAt },
            endsAt: { gt: data.startsAt },
          },
          include: { job: { select: { jobNumber: true } } },
        });
        if (clash) {
          throw new BookingConflict(
            `Press already booked ${clash.startsAt.toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}–${clash.endsAt.toLocaleTimeString("sv-SE", { timeStyle: "short" })}${clash.job ? ` (job #${clash.job.jobNumber})` : ""}`,
          );
        }
        await tx.scheduleBlock.create({
          data: {
            organizationId: orgId,
            pressId: data.pressId,
            jobId: idOrNull(data.jobId),
            startsAt: data.startsAt,
            endsAt: data.endsAt,
            note: data.note || null,
          },
        });
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    if (error instanceof BookingConflict) {
      return { ok: false, error: error.message };
    }
    // Serialization failure from a concurrent booking — ask to retry
    return {
      ok: false,
      error: "Booking conflicted with a concurrent change — try again",
    };
  }

  await db.activityLog.create({
    data: {
      organizationId: orgId,
      type: "SYSTEM",
      summary: `Press time booked ${data.startsAt.toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}`,
      jobId: idOrNull(data.jobId),
      actorId: userId,
    },
  });

  revalidatePath("/schedule");
  return actionOk;
}

class BookingConflict extends Error {}

export async function deleteScheduleBlock(blockId: string): Promise<void> {
  const { orgId } = await requireOrg();
  await tenantDb(orgId).scheduleBlock.delete({ where: { id: blockId } });
  revalidatePath("/schedule");
}
