import { tenantDb } from "@/lib/db/tenant";
import { sendEmailSafe } from "./index";
import { jobStatusEmail, proofRequestEmail } from "./templates";

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

/** Company's first emailable contact + their portal URL (if tokenized). */
async function notifyTarget(orgId: string, companyId: string) {
  const contact = await tenantDb(orgId).contact.findFirst({
    where: { companyId, deletedAt: null, email: { not: null } },
    orderBy: { createdAt: "asc" },
  });
  if (!contact?.email) return null;
  return {
    email: contact.email,
    contactId: contact.id,
    portalUrl: contact.portalToken
      ? `${BASE_URL}/portal/${contact.portalToken}`
      : undefined,
  };
}

async function logNotification(
  orgId: string,
  summary: string,
  contactId: string,
  jobId: string,
) {
  await tenantDb(orgId).activityLog.create({
    data: {
      organizationId: orgId,
      type: "EMAIL",
      summary,
      contactId,
      jobId,
    },
  });
}

export async function notifyJobStatus(
  orgId: string,
  orgName: string,
  job: { id: string; jobNumber: number; title: string; companyId: string },
  status: string,
): Promise<void> {
  const target = await notifyTarget(orgId, job.companyId);
  if (!target) return;

  const { subject, html } = jobStatusEmail({
    orgName,
    jobNumber: job.jobNumber,
    jobTitle: job.title,
    status,
    portalUrl: target.portalUrl,
  });
  if (await sendEmailSafe({ to: target.email, subject, html })) {
    await logNotification(
      orgId,
      `Status email sent: "${subject}"`,
      target.contactId,
      job.id,
    );
  }
}

export async function notifyProofRequest(
  orgId: string,
  orgName: string,
  job: { id: string; jobNumber: number; title: string; companyId: string },
): Promise<void> {
  const target = await notifyTarget(orgId, job.companyId);
  if (!target) return;

  const { subject, html } = proofRequestEmail({
    orgName,
    jobNumber: job.jobNumber,
    jobTitle: job.title,
    portalUrl: target.portalUrl,
  });
  if (await sendEmailSafe({ to: target.email, subject, html })) {
    await logNotification(
      orgId,
      `Proof request email sent: "${subject}"`,
      target.contactId,
      job.id,
    );
  }
}
