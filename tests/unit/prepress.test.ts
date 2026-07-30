import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { runPrepressChecks } from "@/lib/prepress/checks";

const MM_TO_PT = 72 / 25.4;

/** Build a PDF with given trim size + bleed (mm). */
async function makePdf(trimWmm: number, trimHmm: number, bleedMm: number) {
  const doc = await PDFDocument.create();
  const bw = (trimWmm + 2 * bleedMm) * MM_TO_PT;
  const bh = (trimHmm + 2 * bleedMm) * MM_TO_PT;
  const page = doc.addPage([bw, bh]);
  const off = bleedMm * MM_TO_PT;
  page.setTrimBox(off, off, trimWmm * MM_TO_PT, trimHmm * MM_TO_PT);
  page.setBleedBox(0, 0, bw, bh);
  return Buffer.from(await doc.save());
}

async function makePng(width: number, height: number) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 30, b: 90 },
    },
  })
    .png()
    .toBuffer();
}

describe("runPrepressChecks — PDF", () => {
  let goodPdf: Buffer;
  let noBleedPdf: Buffer;

  beforeAll(async () => {
    goodPdf = await makePdf(210, 297, 3);
    noBleedPdf = await makePdf(210, 297, 0);
  });

  it("passes a correctly sized PDF with bleed", async () => {
    const result = await runPrepressChecks(
      goodPdf,
      "application/pdf",
      "a4.pdf",
      {
        widthMm: 210,
        heightMm: 297,
        bleedMm: 3,
      },
    );
    expect(result.verdict).toBe("pass");
    expect(result.checks.find((c) => c.id === "trim-size")?.status).toBe(
      "pass",
    );
    expect(result.checks.find((c) => c.id === "bleed")?.status).toBe("pass");
  });

  it("accepts rotated orientation (landscape vs portrait)", async () => {
    const result = await runPrepressChecks(
      goodPdf,
      "application/pdf",
      "a4.pdf",
      {
        widthMm: 297,
        heightMm: 210,
        bleedMm: 3,
      },
    );
    expect(result.checks.find((c) => c.id === "trim-size")?.status).toBe(
      "pass",
    );
  });

  it("fails on wrong trim size", async () => {
    const result = await runPrepressChecks(
      goodPdf,
      "application/pdf",
      "a4.pdf",
      {
        widthMm: 90,
        heightMm: 55,
        bleedMm: 3,
      },
    );
    expect(result.verdict).toBe("fail");
    expect(result.checks.find((c) => c.id === "trim-size")?.status).toBe(
      "fail",
    );
  });

  it("warns when bleed is missing", async () => {
    const result = await runPrepressChecks(
      noBleedPdf,
      "application/pdf",
      "a4-nobleed.pdf",
      { widthMm: 210, heightMm: 297, bleedMm: 3 },
    );
    expect(result.checks.find((c) => c.id === "bleed")?.status).toBe("warn");
  });

  it("fails on corrupt data", async () => {
    const result = await runPrepressChecks(
      Buffer.from("not a pdf at all"),
      "application/pdf",
      "broken.pdf",
      {},
    );
    expect(result.verdict).toBe("fail");
  });
});

describe("runPrepressChecks — raster", () => {
  it("passes a high-res PNG and warns about RGB", async () => {
    // 90x55mm at 300dpi ≈ 1063x650 px
    const png = await makePng(1100, 680);
    const result = await runPrepressChecks(png, "image/png", "card.png", {
      widthMm: 90,
      heightMm: 55,
    });
    expect(result.checks.find((c) => c.id === "resolution")?.status).toBe(
      "pass",
    );
    expect(result.checks.find((c) => c.id === "color-space")?.status).toBe(
      "warn",
    );
    expect(result.verdict).toBe("warn"); // raster + RGB warnings
  });

  it("fails a low-res image for large-format", async () => {
    const png = await makePng(400, 300);
    const result = await runPrepressChecks(png, "image/png", "poster.png", {
      widthMm: 841,
      heightMm: 1189, // A0
    });
    expect(result.checks.find((c) => c.id === "resolution")?.status).toBe(
      "fail",
    );
    expect(result.verdict).toBe("fail");
  });
});

describe("runPrepressChecks — format gate", () => {
  it("rejects unsupported formats outright", async () => {
    const result = await runPrepressChecks(
      Buffer.from("GIF89a"),
      "image/gif",
      "anim.gif",
      {},
    );
    expect(result.verdict).toBe("fail");
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0].id).toBe("file-type");
  });
});
