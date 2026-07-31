/**
 * Earliest feasible completion for a run — pure, with an injected clock,
 * in the style of lib/insights and lib/pricing (docs/ai-roadmap.md §2.2).
 *
 * Returns null rather than a guess whenever the press has no capability
 * data. "We don't know" is a usable answer; a fabricated Tuesday is not,
 * because a shop will repeat it to a customer.
 */

export type PressCapability = {
  id: string;
  name: string;
  /** null → no estimate possible */
  sheetsPerHour: number | null;
  makereadyMinutes: number | null;
};

export type Booking = { startsAt: Date; endsAt: Date };

export type WorkingHours = {
  /** 1 = Monday … 7 = Sunday (ISO), matching how shops talk about days */
  workdays: number[];
  startHour: number;
  endHour: number;
};

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  workdays: [1, 2, 3, 4, 5],
  startHour: 8,
  endHour: 17,
};

export type TurnaroundInput = {
  now: Date;
  /** press sheets to run — quantity unless imposition is known */
  sheets: number;
  press: PressCapability;
  /** existing commitments on that press */
  bookings: Booking[];
  hours?: WorkingHours;
  /** finishing, drying, collection — added after the press run */
  postPressHours?: number;
};

export type TurnaroundFactor = {
  factor: string;
  minutes: number;
  detail: string;
};

export type TurnaroundEstimate = {
  pressName: string;
  makereadyMinutes: number;
  runMinutes: number;
  postPressMinutes: number;
  totalWorkMinutes: number;
  earliestStart: Date;
  estimatedFinish: Date;
  /** working hours between now and finish, including waiting */
  elapsedHours: number;
  factors: TurnaroundFactor[];
  rationale: string;
};

const MINUTE = 60_000;
const isoDay = (d: Date) => ((d.getUTCDay() + 6) % 7) + 1; // 1=Mon … 7=Sun

/** Start of the next working minute at or after `from`. */
function nextWorkingMoment(from: Date, hours: WorkingHours): Date {
  const cursor = new Date(from);
  for (let guard = 0; guard < 366 * 24; guard++) {
    const day = isoDay(cursor);
    if (!hours.workdays.includes(day)) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      cursor.setUTCHours(hours.startHour, 0, 0, 0);
      continue;
    }
    const hour = cursor.getUTCHours() + cursor.getUTCMinutes() / 60;
    if (hour < hours.startHour) {
      cursor.setUTCHours(hours.startHour, 0, 0, 0);
      return cursor;
    }
    if (hour >= hours.endHour) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      cursor.setUTCHours(hours.startHour, 0, 0, 0);
      continue;
    }
    return cursor;
  }
  return cursor;
}

/** True when [start, end) overlaps any booking. */
function clashingBooking(
  start: Date,
  end: Date,
  bookings: Booking[],
): Booking | undefined {
  return bookings.find(
    (b) =>
      b.startsAt.getTime() < end.getTime() &&
      b.endsAt.getTime() > start.getTime(),
  );
}

/**
 * Consume `workMinutes` of press time, walking forward through working
 * hours and stepping over existing bookings. Same half-open overlap rule
 * the scheduler enforces, so an estimate can never promise a slot the
 * booking check would reject.
 */
function schedule(
  from: Date,
  workMinutes: number,
  bookings: Booking[],
  hours: WorkingHours,
): { start: Date; finish: Date } {
  let cursor = nextWorkingMoment(from, hours);
  let start: Date | null = null;
  let remaining = workMinutes;

  for (let guard = 0; guard < 10_000 && remaining > 0; guard++) {
    const dayEnd = new Date(cursor);
    dayEnd.setUTCHours(hours.endHour, 0, 0, 0);
    const minutesToday = Math.max(
      0,
      Math.floor((dayEnd.getTime() - cursor.getTime()) / MINUTE),
    );
    if (minutesToday === 0) {
      cursor = nextWorkingMoment(new Date(cursor.getTime() + MINUTE), hours);
      continue;
    }

    const attemptEnd = new Date(
      cursor.getTime() + Math.min(remaining, minutesToday) * MINUTE,
    );
    const clash = clashingBooking(cursor, attemptEnd, bookings);
    if (clash) {
      // Jump to the end of the blocking booking and try again
      cursor = nextWorkingMoment(clash.endsAt, hours);
      continue;
    }

    if (!start) start = new Date(cursor);
    const used = Math.min(remaining, minutesToday);
    remaining -= used;
    cursor = new Date(cursor.getTime() + used * MINUTE);
    if (remaining > 0) cursor = nextWorkingMoment(cursor, hours);
  }

  return { start: start ?? cursor, finish: cursor };
}

export function estimateTurnaround(
  input: TurnaroundInput,
): TurnaroundEstimate | null {
  const { press, sheets } = input;
  // Fail closed: without a run speed there is nothing to compute.
  if (!press.sheetsPerHour || press.sheetsPerHour <= 0) return null;
  if (sheets <= 0) return null;

  const hours = input.hours ?? DEFAULT_WORKING_HOURS;
  const makeready = press.makereadyMinutes ?? 0;
  const runMinutes = Math.ceil((sheets / press.sheetsPerHour) * 60);
  const postPress = Math.round((input.postPressHours ?? 0) * 60);
  const totalWork = makeready + runMinutes + postPress;

  const { start, finish } = schedule(
    input.now,
    totalWork,
    input.bookings,
    hours,
  );

  const factors: TurnaroundFactor[] = [
    {
      factor: "makeready",
      minutes: makeready,
      detail: press.makereadyMinutes
        ? `${makeready} min setup on ${press.name}`
        : "no makeready time recorded for this press",
    },
    {
      factor: "run",
      minutes: runMinutes,
      detail: `${sheets.toLocaleString("sv-SE")} sheets at ${press.sheetsPerHour}/h`,
    },
  ];
  if (postPress > 0) {
    factors.push({
      factor: "post-press",
      minutes: postPress,
      detail: `${input.postPressHours} h finishing and handling`,
    });
  }

  const waitingMinutes = Math.max(
    0,
    Math.round((start.getTime() - input.now.getTime()) / MINUTE),
  );
  if (waitingMinutes > 0) {
    factors.push({
      factor: "queue",
      minutes: waitingMinutes,
      detail:
        input.bookings.length > 0
          ? `first free slot on ${press.name} after existing bookings`
          : "next working hours",
    });
  }

  const elapsedHours =
    Math.round(((finish.getTime() - input.now.getTime()) / 3_600_000) * 10) /
    10;

  return {
    pressName: press.name,
    makereadyMinutes: makeready,
    runMinutes,
    postPressMinutes: postPress,
    totalWorkMinutes: totalWork,
    earliestStart: start,
    estimatedFinish: finish,
    elapsedHours,
    factors,
    rationale: `${Math.round(totalWork / 6) / 10} h of press time on ${press.name}${
      waitingMinutes > 0
        ? `, starting ${start.toISOString().slice(0, 16).replace("T", " ")} once the press is free`
        : ", starting now"
    } — finishes ${finish.toISOString().slice(0, 16).replace("T", " ")}.`,
  };
}

/** Would this estimate hit the promised date? */
export function meetsDueDate(
  estimate: TurnaroundEstimate,
  dueDate: Date,
): boolean {
  return estimate.estimatedFinish.getTime() <= dueDate.getTime();
}
