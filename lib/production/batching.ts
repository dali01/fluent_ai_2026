/**
 * Gang-run batching — pure, injected clock (docs/ai-roadmap.md §2.1).
 *
 * DELIBERATELY CONSERVATIVE. This suggests running compatible jobs as
 * ONE setup — same stock, same colour mode, same finishing — and claims
 * only the makeready that consolidation avoids. It does **not** nest
 * different jobs' pieces onto a shared sheet: true imposition depends on
 * grain direction, gripper margins, bleed overlap and finishing paths
 * that the schema does not model, and a batching suggestion that wastes
 * stock destroys trust the first time it is wrong.
 *
 * Everything claimed here is arithmetic on figures the shop entered.
 */

export type BatchableJob = {
  id: string;
  jobNumber: number;
  title: string;
  quantity: number;
  stock: string | null;
  colorMode: string;
  finish: string | null;
  widthMm: number | null;
  heightMm: number | null;
  dueDate: Date | null;
  status: string;
};

export type BatchPress = {
  name: string;
  sheetWidthMm: number | null;
  sheetHeightMm: number | null;
  makereadySheets: number | null;
  makereadyMinutes: number | null;
  hourlyRateCents: number | null;
};

export type BatchJobLine = {
  jobNumber: number;
  title: string;
  quantity: number;
  dueDate: Date | null;
  /** pieces per press sheet, when both the piece and sheet are known */
  piecesPerSheet: number | null;
  /** true when artwork still has to clear proofing/prepress */
  notYetReady: boolean;
};

export type BatchSuggestion = {
  /** the compatibility key, shown to a human */
  stock: string;
  colorMode: string;
  finish: string;
  jobs: BatchJobLine[];
  makereadysAvoided: number;
  sheetsSaved: number;
  minutesSaved: number;
  savingCents: number | null;
  /** the batch must run by this date — the earliest promise in it */
  runBy: Date | null;
  /** days between the earliest and latest due date in the batch */
  dueDateSpreadDays: number;
  rationale: string;
  caveats: string[];
};

const DAY = 86_400_000;

/** Statuses where artwork isn't signed off yet. */
const NOT_READY = new Set(["DESIGN", "PROOFING"]);

/**
 * How many pieces fit on a press sheet, trying both orientations.
 * Ignores gripper and trim margins on purpose — it is reported as
 * context, never used to claim a saving.
 */
export function piecesPerSheet(
  sheetWidthMm: number,
  sheetHeightMm: number,
  pieceWidthMm: number,
  pieceHeightMm: number,
): number {
  if (pieceWidthMm <= 0 || pieceHeightMm <= 0) return 0;
  const portrait =
    Math.floor(sheetWidthMm / pieceWidthMm) *
    Math.floor(sheetHeightMm / pieceHeightMm);
  const landscape =
    Math.floor(sheetWidthMm / pieceHeightMm) *
    Math.floor(sheetHeightMm / pieceWidthMm);
  return Math.max(portrait, landscape);
}

function compatibilityKey(job: BatchableJob): string {
  return [
    (job.stock ?? "").trim().toLowerCase(),
    job.colorMode,
    (job.finish ?? "").trim().toLowerCase(),
  ].join("|");
}

export function suggestBatches(input: {
  jobs: BatchableJob[];
  press: BatchPress;
  now: Date;
  /** how far apart due dates may be before combining is questionable */
  maxDueDateSpreadDays?: number;
  costPerSheet?: number | null;
}): BatchSuggestion[] {
  const { press, jobs, now } = input;
  // No makeready figures means no claimable saving — say nothing rather
  // than invent a number.
  if (!press.makereadySheets && !press.makereadyMinutes) return [];

  const maxSpread = input.maxDueDateSpreadDays ?? 14;
  const groups = new Map<string, BatchableJob[]>();
  for (const job of jobs) {
    // A job with no stock can't be matched to anything safely
    if (!job.stock?.trim()) continue;
    if (job.quantity <= 0) continue;
    const key = compatibilityKey(job);
    groups.set(key, [...(groups.get(key) ?? []), job]);
  }

  const suggestions: BatchSuggestion[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue; // nothing to consolidate

    const dated = group
      .map((j) => j.dueDate)
      .filter((d): d is Date => d instanceof Date)
      .sort((a, b) => a.getTime() - b.getTime());
    const runBy = dated[0] ?? null;
    const spreadDays =
      dated.length > 1
        ? Math.round(
            (dated[dated.length - 1].getTime() - dated[0].getTime()) / DAY,
          )
        : 0;

    const makereadysAvoided = group.length - 1;
    const sheetsSaved = (press.makereadySheets ?? 0) * makereadysAvoided;
    const minutesSaved = (press.makereadyMinutes ?? 0) * makereadysAvoided;
    const sheetCost =
      input.costPerSheet != null ? sheetsSaved * input.costPerSheet * 100 : 0;
    const timeCost =
      press.hourlyRateCents != null
        ? (minutesSaved / 60) * press.hourlyRateCents
        : 0;
    const savingCents =
      input.costPerSheet != null || press.hourlyRateCents != null
        ? Math.round(sheetCost + timeCost)
        : null;

    const lines: BatchJobLine[] = group.map((job) => ({
      jobNumber: job.jobNumber,
      title: job.title,
      quantity: job.quantity,
      dueDate: job.dueDate,
      piecesPerSheet:
        press.sheetWidthMm && press.sheetHeightMm && job.widthMm && job.heightMm
          ? piecesPerSheet(
              press.sheetWidthMm,
              press.sheetHeightMm,
              job.widthMm,
              job.heightMm,
            )
          : null,
      notYetReady: NOT_READY.has(job.status),
    }));

    const caveats: string[] = [
      "Consolidates setup only — pieces are not nested on a shared sheet.",
    ];
    if (spreadDays > maxSpread) {
      caveats.push(
        `Due dates span ${spreadDays} days; the later jobs would be printed well before they are needed.`,
      );
    }
    if (runBy && runBy.getTime() < now.getTime()) {
      caveats.push("One of these jobs is already past its due date.");
    }
    const unready = lines.filter((l) => l.notYetReady);
    if (unready.length > 0) {
      caveats.push(
        `${unready.map((l) => `#${l.jobNumber}`).join(", ")} still ${unready.length === 1 ? "has" : "have"} artwork to approve — the batch can only run once ${unready.length === 1 ? "it is" : "they are"} signed off.`,
      );
    }
    if (lines.some((l) => l.piecesPerSheet === null)) {
      caveats.push(
        "Some jobs have no trim size recorded, so sheet counts are unknown.",
      );
    }

    suggestions.push({
      stock: group[0].stock!.trim(),
      colorMode: group[0].colorMode,
      finish: group[0].finish?.trim() ?? "none",
      jobs: lines,
      makereadysAvoided,
      sheetsSaved,
      minutesSaved,
      savingCents,
      runBy,
      dueDateSpreadDays: spreadDays,
      rationale: `${group.length} jobs share ${group[0].stock!.trim()} / ${group[0].colorMode}${group[0].finish ? ` / ${group[0].finish}` : ""} — running them as one setup avoids ${makereadysAvoided} makeready${makereadysAvoided === 1 ? "" : "s"}${
        sheetsSaved > 0 ? `, saving ${sheetsSaved} sheets` : ""
      }${minutesSaved > 0 ? ` and ${minutesSaved} minutes` : ""}.`,
      caveats,
    });
  }

  // Biggest saving first; unpriced groups fall back to makereadys avoided
  return suggestions.sort(
    (a, b) =>
      (b.savingCents ?? b.makereadysAvoided) -
      (a.savingCents ?? a.makereadysAvoided),
  );
}
