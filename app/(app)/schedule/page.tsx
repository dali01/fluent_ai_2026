import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { BookingDialog } from "@/components/schedule/booking-dialog";
import { CancelBookingButton } from "@/components/schedule/cancel-booking-button";
import { Button } from "@/components/ui/button";
import { requireOrg } from "@/lib/auth/require-org";
import { tenantDb } from "@/lib/db/tenant";

export const metadata = { title: "Schedule" };

/** Monday of the week containing `date`. */
function weekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - day);
  return d;
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { orgId } = await requireOrg();
  const { week } = await searchParams;

  const start = weekStart(week ? new Date(week) : new Date());
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const prev = new Date(start);
  prev.setDate(prev.getDate() - 7);
  const next = new Date(start);
  next.setDate(next.getDate() + 7);

  const db = tenantDb(orgId);
  const [presses, blocks, jobs] = await Promise.all([
    db.press.findMany({
      where: { deletedAt: null, active: true },
      orderBy: { name: "asc" },
    }),
    db.scheduleBlock.findMany({
      where: { startsAt: { lt: end }, endsAt: { gt: start } },
      include: { job: { select: { id: true, jobNumber: true, title: true } } },
      orderBy: { startsAt: "asc" },
    }),
    db.job.findMany({
      where: { deletedAt: null, status: { not: "DONE" } },
      orderBy: { jobNumber: "desc" },
      select: { id: true, jobNumber: true, title: true },
      take: 50,
    }),
  ]);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });

  const fmtWeek = start.toLocaleDateString("sv-SE");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
        <BookingDialog
          presses={presses.map((p) => ({ id: p.id, name: p.name }))}
          jobs={jobs.map((j) => ({
            id: j.id,
            name: `#${j.jobNumber} ${j.title}`,
          }))}
        />
      </div>

      <div className="flex items-center gap-2 text-sm">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Previous week"
          render={
            <Link href={`/schedule?week=${prev.toISOString().slice(0, 10)}`} />
          }
        >
          <ChevronLeft aria-hidden />
        </Button>
        <span className="font-medium">Week of {fmtWeek}</span>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Next week"
          render={
            <Link href={`/schedule?week=${next.toISOString().slice(0, 10)}`} />
          }
        >
          <ChevronRight aria-hidden />
        </Button>
      </div>

      {presses.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-muted-foreground">
          <CalendarDays className="size-8" aria-hidden />
          <p>No presses yet — they arrive with seed data or Settings later.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-4xl border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="w-40 px-3 py-2 text-left font-medium">Press</th>
                {days.map((day) => (
                  <th
                    key={day.toISOString()}
                    className="px-2 py-2 text-left font-medium"
                  >
                    {day.toLocaleDateString("sv-SE", {
                      weekday: "short",
                      day: "numeric",
                      month: "numeric",
                    })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {presses.map((press) => (
                <tr key={press.id} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{press.name}</td>
                  {days.map((day) => {
                    const dayEnd = new Date(day);
                    dayEnd.setDate(dayEnd.getDate() + 1);
                    const dayBlocks = blocks.filter(
                      (b) =>
                        b.pressId === press.id &&
                        b.startsAt < dayEnd &&
                        b.endsAt > day,
                    );
                    return (
                      <td
                        key={day.toISOString()}
                        className="min-w-28 px-2 py-2 align-top"
                      >
                        <div className="flex flex-col gap-1">
                          {dayBlocks.map((block) => (
                            <div
                              key={block.id}
                              className="group flex items-start justify-between gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs"
                            >
                              <span>
                                <span className="font-mono">
                                  {block.startsAt.toLocaleTimeString("sv-SE", {
                                    timeStyle: "short",
                                  })}
                                  –
                                  {block.endsAt.toLocaleTimeString("sv-SE", {
                                    timeStyle: "short",
                                  })}
                                </span>{" "}
                                {block.job ? (
                                  <Link
                                    href={`/jobs/${block.job.id}`}
                                    className="font-medium hover:underline"
                                  >
                                    #{block.job.jobNumber}
                                  </Link>
                                ) : (
                                  (block.note ?? "Reserved")
                                )}
                              </span>
                              <CancelBookingButton blockId={block.id} />
                            </div>
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
