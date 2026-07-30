import { timingSafeEqual } from "node:crypto";

/**
 * Cron authorization: constant-time compare of the bearer token against
 * CRON_SECRET. FAILS CLOSED when the secret is unset. First code to read
 * CRON_SECRET (documented in .env.example since Phase 0).
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
