import { tenantDb } from "@/lib/db/tenant";
import {
  analyzeCycleTime,
  onTimeRate,
  type CycleTimeReport,
} from "./cycle-time";
import {
  DEFAULT_WORKING_HOURS,
  estimateTurnaround,
  type TurnaroundEstimate,
  type WorkingHours,
} from "./turnaround";

/**
 * DB adapters for the pure production modules. Everything that decides
 * anything lives in ./cycle-time.ts and ./turnaround.ts; this file only
 * loads rows and hands them over.
 */

export type ProductionReport = {
  cycle: CycleTimeReport;
  onTime: { rate: number; sample: number } | null;
};

export async function buildProductionReport(
  orgId: string,
  now: Date = new Date(),
  sinceDays = 180,
): Promise<ProductionReport> {
  const db = tenantDb(orgId);
  const since = new Date(now.getTime() - sinceDays * 86_400_000);

  const [events, jobs] = await Promise.all([
    db.jobStatusEvent.findMany({
      where: { at: { gte: since } },
      select: { jobId: true, fromStatus: true, toStatus: true, at: true },
      orderBy: { at: "asc" },
      take: 5000,
    }),
    db.job.findMany({
      where: { deletedAt: null, deliveredAt: { not: null, gte: since } },
      select: { dueDate: true, deliveredAt: true },
    }),
  ]);

  return {
    cycle: analyzeCycleTime(events, now),
    onTime: onTimeRate(jobs),
  };
}

/**
 * "Can we promise this?" for one job, using its assigned press (or the
 * fastest press with capability data when none is assigned).
 */
export async function estimateJobTurnaround(
  orgId: string,
  jobId: string,
  now: Date = new Date(),
  hours: WorkingHours = DEFAULT_WORKING_HOURS,
): Promise<TurnaroundEstimate | null> {
  const db = tenantDb(orgId);
  const job = await db.job.findUnique({
    where: { id: jobId },
    select: { quantity: true, pressId: true },
  });
  if (!job || job.quantity <= 0) return null;

  const presses = await db.press.findMany({
    where: {
      deletedAt: null,
      active: true,
      ...(job.pressId ? { id: job.pressId } : { sheetsPerHour: { not: null } }),
    },
    select: {
      id: true,
      name: true,
      sheetsPerHour: true,
      makereadyMinutes: true,
    },
    orderBy: { sheetsPerHour: "desc" },
  });
  const press = presses[0];
  if (!press) return null;

  const bookings = await db.scheduleBlock.findMany({
    where: { pressId: press.id, endsAt: { gte: now } },
    select: { startsAt: true, endsAt: true },
  });

  return estimateTurnaround({
    now,
    sheets: job.quantity,
    press: {
      id: press.id,
      name: press.name,
      sheetsPerHour: press.sheetsPerHour,
      makereadyMinutes: press.makereadyMinutes,
    },
    bookings,
    hours,
  });
}
