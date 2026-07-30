import { ConsoleEmailProvider, ResendEmailProvider } from "./providers";

/**
 * Notification abstraction. Email is wired (Resend in production via
 * RESEND_API_KEY, console/activity-log fallback in dev); SMS is a stub
 * behind the same shape until a provider is chosen (TODO-FUTURE).
 *
 * Senders never throw — a failed notification must never break the
 * business action that triggered it. Failures are logged.
 */

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
};

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

let emailProvider: EmailProvider | undefined;

export function getEmailProvider(): EmailProvider {
  if (!emailProvider) {
    emailProvider = process.env.RESEND_API_KEY
      ? new ResendEmailProvider()
      : new ConsoleEmailProvider();
  }
  return emailProvider;
}

export async function sendEmailSafe(message: EmailMessage): Promise<boolean> {
  try {
    await getEmailProvider().send(message);
    return true;
  } catch (error) {
    console.error("[notifications] email failed:", error);
    return false;
  }
}

/** SMS stub — logs only. Twilio slot documented in .env.example. */
export async function sendSmsSafe(to: string, body: string): Promise<boolean> {
  console.log(`[notifications] SMS stub → ${to}: ${body}`);
  return false;
}
