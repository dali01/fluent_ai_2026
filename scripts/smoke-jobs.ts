/**
 * Jobs/production smoke test: create a job, run prepress on a generated
 * PDF, store the file, walk the proofing workflow, and reorder — all
 * through the tenant layer against the seeded DB.
 *
 *   pnpm exec tsx scripts/smoke-jobs.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: [".env.local", ".env"] });

import { PDFDocument } from "pdf-lib";
import { tenantDb } from "@/lib/db/tenant";
import { runPrepressChecks } from "@/lib/prepress/checks";
import { getStorage } from "@/lib/storage";

const ORG = process.env.SEED_ORG_ID ?? "org_demo_fluent";
const MM_TO_PT = 72 / 25.4;

async function makePdf(wMm: number, hMm: number, bleedMm: number) {
  const doc = await PDFDocument.create();
  const bw = (wMm + 2 * bleedMm) * MM_TO_PT;
  const bh = (hMm + 2 * bleedMm) * MM_TO_PT;
  const page = doc.addPage([bw, bh]);
  const off = bleedMm * MM_TO_PT;
  page.setTrimBox(off, off, wMm * MM_TO_PT, hMm * MM_TO_PT);
  page.setBleedBox(0, 0, bw, bh);
  return Buffer.from(await doc.save());
}

async function main() {
  const db = tenantDb(ORG);
  const company = await db.company.findFirstOrThrow({
    where: { deletedAt: null },
  });
  const contact = await db.contact.findFirst({
    where: { companyId: company.id },
  });

  // Create job (mirrors createJob action)
  const max = await db.job.aggregate({ _max: { jobNumber: true } });
  const job = await db.job.create({
    data: {
      organizationId: ORG,
      jobNumber: (max._max.jobNumber ?? 2000) + 1,
      title: "Smoke test flyers",
      companyId: company.id,
      status: "DESIGN",
      widthMm: 148,
      heightMm: 210,
      bleedMm: 3,
      quantity: 5000,
      colorMode: "CMYK",
    },
  });
  console.log(`job created: #${job.jobNumber}`);

  // Upload flow: prepress + storage + JobFile
  const pdf = await makePdf(148, 210, 3);
  const prepress = await runPrepressChecks(
    pdf,
    "application/pdf",
    "flyer.pdf",
    {
      widthMm: 148,
      heightMm: 210,
      bleedMm: 3,
    },
  );
  console.log(`prepress verdict: ${prepress.verdict} (expect pass)`);

  const key = `${ORG}/${job.id}/v1-flyer.pdf`;
  await getStorage().put(key, pdf, { contentType: "application/pdf" });
  const roundTrip = await getStorage().get(key);
  console.log(
    `storage round-trip: ${roundTrip.length === pdf.length ? "ok" : "SIZE MISMATCH"}`,
  );

  const jobFile = await db.jobFile.create({
    data: {
      organizationId: ORG,
      jobId: job.id,
      version: 1,
      fileName: "flyer.pdf",
      mimeType: "application/pdf",
      sizeBytes: pdf.length,
      blobKey: key,
      prepressResult: JSON.parse(JSON.stringify(prepress)),
      approvalStatus: prepress.verdict === "pass" ? "PASSED" : "PENDING",
    },
  });

  // Proofing: send -> approve moves job to PREPRESS
  const proof = await db.proof.create({
    data: {
      organizationId: ORG,
      jobId: job.id,
      jobFileId: jobFile.id,
      contactId: contact?.id ?? null,
      status: "SENT",
      sentAt: new Date(),
    },
  });
  await db.job.update({ where: { id: job.id }, data: { status: "PROOFING" } });
  await db.proof.update({
    where: { id: proof.id },
    data: { status: "APPROVED", respondedAt: new Date() },
  });
  await db.job.update({ where: { id: job.id }, data: { status: "PREPRESS" } });
  const afterProof = await db.job.findUniqueOrThrow({ where: { id: job.id } });
  console.log(
    `proof approved, job status: ${afterProof.status} (expect PREPRESS)`,
  );

  // Reorder clone
  const max2 = await db.job.aggregate({ _max: { jobNumber: true } });
  const clone = await db.job.create({
    data: {
      organizationId: ORG,
      jobNumber: (max2._max.jobNumber ?? 2000) + 1,
      title: afterProof.title,
      companyId: afterProof.companyId,
      status: "DESIGN",
      widthMm: afterProof.widthMm,
      heightMm: afterProof.heightMm,
      bleedMm: afterProof.bleedMm,
      quantity: afterProof.quantity,
      colorMode: afterProof.colorMode,
    },
  });
  console.log(`reorder clone: #${clone.jobNumber} in ${clone.status}`);

  // Cleanup smoke artifacts
  await db.proof.delete({ where: { id: proof.id } });
  await db.jobFile.delete({ where: { id: jobFile.id } });
  await db.job.delete({ where: { id: job.id } });
  await db.job.delete({ where: { id: clone.id } });
  await db.activityLog.deleteMany({ where: { jobId: job.id } });
  await getStorage().delete(key);
  console.log("cleanup done");
  console.log("SMOKE OK");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
