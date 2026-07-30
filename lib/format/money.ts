/** Client-safe: currency constants live here, NOT in lib/db (pg/dns). */
export const CURRENCIES = ["SEK", "EUR", "USD", "GBP", "NOK", "DKK"] as const;
export type Currency = (typeof CURRENCIES)[number];

/**
 * All money rendering goes through here — the org's currency comes from
 * Organization.settings.general (lib/db/org-settings.ts). Amounts are
 * stored as plain decimals with no currency column; the org setting is
 * a display concern, not a conversion.
 */
export function formatMoney(
  // number, numeric string, or Prisma Decimal — anything Number() takes
  amount: number | string | { toString(): string } | null | undefined,
  currency: Currency = "SEK",
): string {
  const n = Number(amount ?? 0);
  return new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}
