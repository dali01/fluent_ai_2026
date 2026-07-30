/**
 * Business-name normalization for dedupe — pure, no Prisma import.
 * See docs/prospecting.md §4.
 */

/** Legal-form suffixes stripped from name tails. Industry tokens
 * (pharma, labs, therapeutics…) are deliberately NOT here — they are
 * exactly what distinguishes "Alpha Therapeutics" from "Alpha Logistics". */
const LEGAL_SUFFIXES = new Set([
  "inc",
  "llc",
  "ltd",
  "limited",
  "corp",
  "corporation",
  "co",
  "company",
  "plc",
  "gmbh",
  "ab",
  "hb",
  "kb",
  "oy",
  "as",
  "a/s",
  "sa",
  "nv",
  "bv",
]);

/** casefold → strip diacritics → &→and → drop leading "the" → drop
 * punctuation → strip trailing legal suffixes → collapse whitespace.
 * Idempotent: f(f(x)) === f(x). */
export function normalizeBusinessName(raw: string): string {
  let s = raw
    .toLowerCase()
    .normalize("NFKD")
    .replaceAll(/[̀-ͯ]/g, "")
    .replaceAll("&", " and ")
    .replaceAll(/[^\p{L}\p{N}/\s]/gu, " ")
    .replaceAll(/\s+/g, " ")
    .trim();

  if (s.startsWith("the ")) s = s.slice(4);

  const tokens = s.split(" ");
  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  return tokens.join(" ").trim();
}

/** Token-set key: normalized tokens, sorted, deduped. Order-insensitive
 * name identity — "USA Teva Pharms" ≡ "Teva Pharms USA". */
export function nameKey(raw: string): string {
  const tokens = normalizeBusinessName(raw).split(" ").filter(Boolean);
  return [...new Set(tokens)].sort().join(" ");
}

/** Location identity for local sources: name + street + postal. Null when
 * street or postal is missing — never guess a location match. */
export function locationKey(
  name: string,
  line1?: string | null,
  postal?: string | null,
): string | null {
  const street = (line1 ?? "").toLowerCase().replaceAll(/\s+/g, " ").trim();
  const zip = (postal ?? "").toLowerCase().replaceAll(/\s+/g, "").trim();
  if (!street || !zip) return null;
  return `${normalizeBusinessName(name)}|${street}|${zip}`;
}

/** Same-name test for the FDA path: token-set equality after
 * normalization. Strict by design — no fuzzy distance (pg_trgm is on
 * TODO-FUTURE). */
export function isLikelySameName(a: string, b: string): boolean {
  const ka = nameKey(a);
  const kb = nameKey(b);
  if (!ka || !kb) return false;
  return ka === kb;
}
