import { PDFDocument } from "pdf-lib";
import sharp from "sharp";

/**
 * Deterministic prepress checks — no AI involved. Claude only ever gets
 * these structured results to explain in plain English (Phase 8).
 *
 * All dimension math is in millimetres. PDF user space: 1pt = 1/72 inch.
 */

export type CheckStatus = "pass" | "warn" | "fail";

export type PrepressCheck = {
  id: string;
  label: string;
  status: CheckStatus;
  message: string;
  data?: Record<string, unknown>;
};

export type PrepressResult = {
  ranAt: string;
  fileType: string;
  checks: PrepressCheck[];
  /** worst status across checks */
  verdict: CheckStatus;
};

export type JobSpecs = {
  widthMm?: number | null;
  heightMm?: number | null;
  bleedMm?: number | null;
  quantity?: number;
};

const PT_TO_MM = 25.4 / 72;
const MM_TOLERANCE = 1.5; // cutting tolerance
const MIN_PRINT_DPI = 300;
const WARN_PRINT_DPI = 150;

const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "raster",
  "image/png": "raster",
  "image/tiff": "raster",
};

function worst(checks: PrepressCheck[]): CheckStatus {
  if (checks.some((c) => c.status === "fail")) return "fail";
  if (checks.some((c) => c.status === "warn")) return "warn";
  return "pass";
}

export async function runPrepressChecks(
  file: Buffer,
  mimeType: string,
  fileName: string,
  specs: JobSpecs,
): Promise<PrepressResult> {
  const checks: PrepressCheck[] = [];
  const kind = ALLOWED_TYPES[mimeType];

  if (!kind) {
    checks.push({
      id: "file-type",
      label: "File format",
      status: "fail",
      message: `"${mimeType || fileName}" is not a supported print format. Send PDF (preferred), TIFF, PNG or JPEG.`,
    });
    return {
      ranAt: new Date().toISOString(),
      fileType: mimeType || "unknown",
      checks,
      verdict: "fail",
    };
  }

  checks.push({
    id: "file-type",
    label: "File format",
    status: kind === "pdf" ? "pass" : "warn",
    message:
      kind === "pdf"
        ? "PDF received — the preferred press-ready format."
        : "Raster file received. PDFs preserve vector text and are preferred for print.",
  });

  try {
    if (kind === "pdf") {
      checks.push(...(await pdfChecks(file, specs)));
    } else {
      checks.push(...(await rasterChecks(file, specs)));
    }
  } catch (error) {
    checks.push({
      id: "parse",
      label: "File integrity",
      status: "fail",
      message: `The file could not be parsed (${error instanceof Error ? error.message : "unknown error"}). It may be corrupt or password-protected.`,
    });
  }

  return {
    ranAt: new Date().toISOString(),
    fileType: mimeType,
    checks,
    verdict: worst(checks),
  };
}

async function pdfChecks(
  file: Buffer,
  specs: JobSpecs,
): Promise<PrepressCheck[]> {
  const checks: PrepressCheck[] = [];
  const doc = await PDFDocument.load(new Uint8Array(file), {
    ignoreEncryption: true,
  });
  const pages = doc.getPages();

  checks.push({
    id: "page-count",
    label: "Pages",
    status: "pass",
    message: `${pages.length} page${pages.length === 1 ? "" : "s"}.`,
    data: { pageCount: pages.length },
  });

  const page = pages[0];
  const media = page.getMediaBox();
  const trim = page.getTrimBox();
  const bleed = page.getBleedBox();

  const trimWmm = trim.width * PT_TO_MM;
  const trimHmm = trim.height * PT_TO_MM;

  // Trim size vs job spec (orientation-agnostic)
  if (specs.widthMm && specs.heightMm) {
    const matches =
      (Math.abs(trimWmm - specs.widthMm) <= MM_TOLERANCE &&
        Math.abs(trimHmm - specs.heightMm) <= MM_TOLERANCE) ||
      (Math.abs(trimWmm - specs.heightMm) <= MM_TOLERANCE &&
        Math.abs(trimHmm - specs.widthMm) <= MM_TOLERANCE);
    checks.push({
      id: "trim-size",
      label: "Trim size",
      status: matches ? "pass" : "fail",
      message: matches
        ? `Trim box ${trimWmm.toFixed(1)}×${trimHmm.toFixed(1)} mm matches the job spec.`
        : `Trim box is ${trimWmm.toFixed(1)}×${trimHmm.toFixed(1)} mm but the job is ${specs.widthMm}×${specs.heightMm} mm.`,
      data: {
        trimWmm,
        trimHmm,
        specWmm: specs.widthMm,
        specHmm: specs.heightMm,
      },
    });
  }

  // Bleed: bleed box must extend beyond trim box on every side
  const requiredBleed = specs.bleedMm ?? 3;
  const bleedLeft = (trim.x - bleed.x) * PT_TO_MM;
  const bleedBottom = (trim.y - bleed.y) * PT_TO_MM;
  const bleedRight = (bleed.x + bleed.width - (trim.x + trim.width)) * PT_TO_MM;
  const bleedTop = (bleed.y + bleed.height - (trim.y + trim.height)) * PT_TO_MM;
  const minBleed = Math.min(bleedLeft, bleedBottom, bleedRight, bleedTop);

  const boxesDistinct =
    bleed.width > trim.width + 0.01 || bleed.height > trim.height + 0.01;
  if (!boxesDistinct) {
    const mediaLargerThanTrim =
      media.width > trim.width + 0.01 || media.height > trim.height + 0.01;
    checks.push({
      id: "bleed",
      label: "Bleed",
      status: requiredBleed > 0 ? "warn" : "pass",
      message: mediaLargerThanTrim
        ? "No bleed box defined, but the media box extends beyond the trim — bleed may exist without being declared."
        : `No bleed defined. The job expects ${requiredBleed} mm bleed; edge-to-edge artwork will show white slivers when cut.`,
      data: { minBleedMm: 0, requiredBleedMm: requiredBleed },
    });
  } else {
    const ok = minBleed >= requiredBleed - 0.5;
    checks.push({
      id: "bleed",
      label: "Bleed",
      status: ok ? "pass" : "warn",
      message: ok
        ? `Bleed of ${minBleed.toFixed(1)} mm on the tightest side (≥ ${requiredBleed} mm required).`
        : `Bleed is only ${minBleed.toFixed(1)} mm on the tightest side; ${requiredBleed} mm required.`,
      data: { minBleedMm: minBleed, requiredBleedMm: requiredBleed },
    });
  }

  // Consistent page sizes across the document
  if (pages.length > 1) {
    const first = pages[0].getMediaBox();
    const inconsistent = pages.some((p) => {
      const b = p.getMediaBox();
      return (
        Math.abs(b.width - first.width) > 1 ||
        Math.abs(b.height - first.height) > 1
      );
    });
    checks.push({
      id: "page-size-consistency",
      label: "Page size consistency",
      status: inconsistent ? "warn" : "pass",
      message: inconsistent
        ? "Pages have differing sizes — verify this is intentional."
        : "All pages share the same size.",
    });
  }

  return checks;
}

async function rasterChecks(
  file: Buffer,
  specs: JobSpecs,
): Promise<PrepressCheck[]> {
  const checks: PrepressCheck[] = [];
  const meta = await sharp(file).metadata();
  const { width = 0, height = 0, space, density } = meta;

  checks.push({
    id: "dimensions",
    label: "Pixel dimensions",
    status: width > 0 && height > 0 ? "pass" : "fail",
    message: `${width}×${height} px.`,
    data: { width, height },
  });

  // Effective DPI at the job's physical size (orientation-agnostic best case)
  if (specs.widthMm && specs.heightMm && width > 0 && height > 0) {
    const wIn = specs.widthMm / 25.4;
    const hIn = specs.heightMm / 25.4;
    const dpiA = Math.min(width / wIn, height / hIn);
    const dpiB = Math.min(width / hIn, height / wIn);
    const effectiveDpi = Math.round(Math.max(dpiA, dpiB));
    const status: CheckStatus =
      effectiveDpi >= MIN_PRINT_DPI
        ? "pass"
        : effectiveDpi >= WARN_PRINT_DPI
          ? "warn"
          : "fail";
    checks.push({
      id: "resolution",
      label: "Effective resolution",
      status,
      message:
        status === "pass"
          ? `${effectiveDpi} DPI at ${specs.widthMm}×${specs.heightMm} mm — print-ready.`
          : `${effectiveDpi} DPI at ${specs.widthMm}×${specs.heightMm} mm — below the ${MIN_PRINT_DPI} DPI print standard${status === "fail" ? " and likely to look pixelated" : ""}.`,
      data: { effectiveDpi, minDpi: MIN_PRINT_DPI },
    });
  } else if (density) {
    checks.push({
      id: "resolution",
      label: "Embedded resolution",
      status: density >= MIN_PRINT_DPI ? "pass" : "warn",
      message: `Embedded density ${Math.round(density)} DPI (no job dimensions to verify against).`,
      data: { density },
    });
  }

  // Color space
  const isCmyk = space === "cmyk";
  checks.push({
    id: "color-space",
    label: "Color space",
    status: isCmyk ? "pass" : "warn",
    message: isCmyk
      ? "CMYK — matches press output."
      : `File is ${space?.toUpperCase() ?? "unknown"}; it will be converted to CMYK at the RIP and colors may shift.`,
    data: { space },
  });

  return checks;
}
