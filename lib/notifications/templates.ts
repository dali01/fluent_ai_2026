/** Minimal branded HTML email wrapper + per-event templates. */

function layout(orgName: string, title: string, body: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f5f2;font-family:Inter,Arial,sans-serif;color:#22242e">
<div style="max-width:560px;margin:0 auto;padding:32px 16px">
  <div style="font-weight:600;font-size:14px;margin-bottom:16px">${orgName} <span style="color:#8b8fa3">· via Fluent AI</span></div>
  <div style="background:#ffffff;border:1px solid #e6e5ef;border-radius:12px;padding:28px">
    <h1 style="font-size:18px;margin:0 0 12px">${title}</h1>
    ${body}
  </div>
  <div style="color:#8b8fa3;font-size:12px;margin-top:16px">You received this because ${orgName} manages your print orders in Fluent AI.</div>
</div>
</body></html>`;
}

const button = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;background:#3f3f9e;color:#fff;text-decoration:none;border-radius:8px;padding:10px 18px;font-size:14px;margin-top:12px">${label}</a>`;

const STAGE_TEXT: Record<string, string> = {
  DESIGN: "is in design",
  PROOFING: "is awaiting proof approval",
  PREPRESS: "is in prepress",
  PRINTING: "is on the press",
  FINISHING: "is being finished",
  SHIPPING: "is on its way",
  DONE: "is complete",
};

export function jobStatusEmail(options: {
  orgName: string;
  jobNumber: number;
  jobTitle: string;
  status: string;
  portalUrl?: string;
}): { subject: string; html: string } {
  const phrase = STAGE_TEXT[options.status] ?? `moved to ${options.status}`;
  return {
    subject: `Order #${options.jobNumber} ${phrase}`,
    html: layout(
      options.orgName,
      `Your order ${phrase}`,
      `<p style="margin:0;font-size:14px;line-height:1.6">
        <strong>#${options.jobNumber} — ${options.jobTitle}</strong><br/>
        Status: ${options.status.charAt(0) + options.status.slice(1).toLowerCase()}
      </p>${options.portalUrl ? button(options.portalUrl, "Track your order") : ""}`,
    ),
  };
}

export function proofRequestEmail(options: {
  orgName: string;
  jobNumber: number;
  jobTitle: string;
  portalUrl?: string;
}): { subject: string; html: string } {
  return {
    subject: `Proof ready for approval — order #${options.jobNumber}`,
    html: layout(
      options.orgName,
      "Your proof is ready",
      `<p style="margin:0;font-size:14px;line-height:1.6">
        Please review and approve the proof for
        <strong>#${options.jobNumber} — ${options.jobTitle}</strong>
        so we can move it to press.
      </p>${options.portalUrl ? button(options.portalUrl, "Review proof") : ""}`,
    ),
  };
}
