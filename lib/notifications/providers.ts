import type { EmailMessage, EmailProvider } from "./index";

const FROM = process.env.EMAIL_FROM ?? "Fluent AI <onboarding@resend.dev>";

/** Production email via Resend's REST API (no SDK dependency needed). */
export class ResendEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [message.to],
        subject: message.subject,
        html: message.html,
      }),
    });
    if (!res.ok) {
      throw new Error(`Resend ${res.status}: ${await res.text()}`);
    }
  }
}

/** Dev fallback: emails land in the server log instead of inboxes. */
export class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    console.log(
      `[email:console] to=${message.to} subject="${message.subject}"\n${message.html
        .replaceAll(/<[^>]+>/g, "")
        .trim()
        .slice(0, 500)}`,
    );
  }
}
