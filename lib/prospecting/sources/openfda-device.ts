import { z } from "zod";
import { fetchJson } from "../http";
import type {
  DiscoveredProspect,
  ProspectSource,
  SourceContext,
  SourceResult,
} from "./types";

/**
 * openFDA 510(k) device clearances — keyless, same delta/pagination
 * shape as the drug connector (sources/openfda.ts). A cleared device
 * cannot ship without instructions-for-use booklets, cartons and
 * sterile-barrier labels, and the applicant's address is in the record,
 * so these are unusually complete prospects.
 *
 * Dedupe is name mode (applicant identity), so a clearance for a
 * company we already serve becomes an upsell signal rather than a
 * duplicate — same as drug approvals.
 */

const recordSchema = z
  .object({
    k_number: z.string(),
    applicant: z.string().optional(),
    device_name: z.string().optional(),
    decision_code: z.string().optional(),
    decision_date: z.string().optional(),
    product_code: z.string().optional(),
    clearance_type: z.string().optional(),
    address_1: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postal_code: z.string().optional(),
    zip_code: z.string().optional(),
    country_code: z.string().optional(),
  })
  .loose();

const responseSchema = z
  .object({ results: z.array(z.unknown()).optional() })
  .loose();

/** Pure parser — the unit-tested half. */
export function parseDeviceResponse(json: unknown): DiscoveredProspect[] {
  const parsed = responseSchema.safeParse(json);
  if (!parsed.success || !parsed.data.results) return [];

  const out: DiscoveredProspect[] = [];
  for (const row of parsed.data.results) {
    const record = recordSchema.safeParse(row);
    if (!record.success) continue;
    const r = record.data;

    const applicant = r.applicant?.trim();
    if (!applicant) continue; // no company → not a lead

    const decisionDate = r.decision_date
      ? new Date(`${r.decision_date}T00:00:00Z`)
      : undefined;

    out.push({
      externalId: r.k_number,
      name: applicant,
      triggerReason: `FDA 510(k) clearance — ${r.device_name ?? "device"}`,
      category: "medical device",
      triggeredAt:
        decisionDate && !Number.isNaN(decisionDate.getTime())
          ? decisionDate
          : undefined,
      address: {
        line1: r.address_1?.trim() || undefined,
        city: r.city?.trim() || undefined,
        postalCode: (r.postal_code ?? r.zip_code)?.trim() || undefined,
        country: r.country_code?.trim() || undefined,
      },
      raw: {
        kNumber: r.k_number,
        deviceName: r.device_name,
        decisionCode: r.decision_code,
        productCode: r.product_code,
        clearanceType: r.clearance_type,
        state: r.state,
      },
    });
  }
  return out;
}

const fmt = (d: Date) => d.toISOString().slice(0, 10).replaceAll("-", "");

export const openFdaDeviceSource: ProspectSource = {
  id: "fda_device",
  label: "FDA device clearances",

  isConfigured() {
    return true; // keyless; OPENFDA_API_KEY only raises rate limits
  },

  unavailableReason() {
    return undefined; // always available
  },

  async fetchBatch(ctx: SourceContext): Promise<SourceResult> {
    const today = new Date();
    const defaultSince = new Date(today.getTime() - 30 * 86_400_000);
    const sinceDate = ctx.since
      ? new Date(
          `${ctx.since.slice(0, 4)}-${ctx.since.slice(4, 6)}-${ctx.since.slice(6, 8)}T00:00:00Z`,
        )
      : defaultSince;
    // openFDA backfills late; re-poll a 3-day overlap every run
    const overlapped = new Date(sinceDate.getTime() - 3 * 86_400_000);

    const search = `decision_date:[${fmt(overlapped)}+TO+${fmt(today)}]`;
    const apiKey = process.env.OPENFDA_API_KEY;

    const prospects: DiscoveredProspect[] = [];
    const warnings: string[] = [];
    let skip = 0;
    let truncated = false;

    while (prospects.length < ctx.limit) {
      const pageSize = 100;
      const url =
        `https://api.fda.gov/device/510k.json?search=${search}` +
        `&sort=decision_date:asc&limit=${pageSize}&skip=${skip}` +
        (apiKey ? `&api_key=${apiKey}` : "");

      let json: unknown;
      try {
        json = await fetchJson(url, { signal: ctx.signal });
      } catch (error) {
        // 404 from openFDA means "no results in window" — not an error
        if (
          error instanceof Error &&
          "status" in error &&
          (error as { status: number }).status === 404
        ) {
          break;
        }
        throw error;
      }

      const batch = parseDeviceResponse(json);
      const rows = (json as { results?: unknown[] }).results?.length ?? 0;
      prospects.push(...batch);
      skip += pageSize;
      if (rows < pageSize) break;
      if (prospects.length >= ctx.limit) {
        truncated = true;
        warnings.push(`hit run cap ${ctx.limit}; window will re-poll`);
        break;
      }
    }

    return {
      prospects: prospects.slice(0, ctx.limit),
      cursor: truncated ? undefined : fmt(today),
      shared: true, // tenant-independent — fetch once, fan out
      warnings,
      truncated,
    };
  },
};
