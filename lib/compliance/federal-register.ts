import { z } from "zod";
import { fetchJson } from "@/lib/prospecting/http";
import type { ComplianceRule } from "./rules";

/**
 * federalregister.gov API — keyless and public. Final rules only:
 * proposed rules change before they bite, and telling a customer to
 * reprint for a rule that never took effect is worse than saying
 * nothing.
 */

const ENDPOINT = "https://www.federalregister.gov/api/v1/documents.json";

const documentSchema = z
  .object({
    document_number: z.string(),
    title: z.string(),
    abstract: z.string().nullable().optional(),
    publication_date: z.string(),
    effective_on: z.string().nullable().optional(),
    html_url: z.string(),
    agencies: z
      .array(z.object({ name: z.string().optional() }).loose())
      .optional(),
  })
  .loose();

const responseSchema = z
  .object({ results: z.array(z.unknown()).optional() })
  .loose();

/** Pure parser — the unit-tested half. */
export function parseFederalRegister(json: unknown): ComplianceRule[] {
  const parsed = responseSchema.safeParse(json);
  if (!parsed.success || !parsed.data.results) return [];

  const out: ComplianceRule[] = [];
  for (const row of parsed.data.results) {
    const doc = documentSchema.safeParse(row);
    if (!doc.success) continue;
    const d = doc.data;
    const published = new Date(`${d.publication_date}T00:00:00Z`);
    if (Number.isNaN(published.getTime())) continue;

    const effective = d.effective_on
      ? new Date(`${d.effective_on}T00:00:00Z`)
      : null;

    out.push({
      documentNumber: d.document_number,
      title: d.title,
      agencies:
        d.agencies?.map((a) => a.name).filter((n): n is string => Boolean(n)) ??
        [],
      publishedAt: published,
      effectiveAt:
        effective && !Number.isNaN(effective.getTime()) ? effective : null,
      url: d.html_url,
      abstract: d.abstract ?? "",
    });
  }
  return out;
}

export async function fetchLabellingRules(options: {
  since: Date;
  limit?: number;
  signal?: AbortSignal;
}): Promise<ComplianceRule[]> {
  const params = new URLSearchParams({
    "conditions[type][]": "RULE",
    "conditions[term]": "labeling OR labelling OR packaging",
    "conditions[publication_date][gte]": options.since
      .toISOString()
      .slice(0, 10),
    per_page: String(options.limit ?? 40),
    order: "newest",
  });
  for (const field of [
    "document_number",
    "title",
    "abstract",
    "publication_date",
    "effective_on",
    "html_url",
    "agencies",
  ]) {
    params.append("fields[]", field);
  }

  const json = await fetchJson(`${ENDPOINT}?${params.toString()}`, {
    signal: options.signal,
  });
  return parseFederalRegister(json);
}
