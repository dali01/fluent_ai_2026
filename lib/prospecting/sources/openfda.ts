import { z } from "zod";
import { fetchJson } from "../http";
import type {
  DiscoveredProspect,
  ProspectSource,
  SourceContext,
  SourceResult,
} from "./types";

/**
 * openFDA Drugs@FDA connector — free, keyless (a key only raises rate
 * limits), nationwide, tenant-independent (`shared: true`).
 * docs/prospecting.md §8: YYYYMMDD dates, ~3-day overlap re-query
 * (openFDA backfills late; idempotency comes from the unique constraint),
 * one prospect per APPLICATION (not per submission), NDA|ANDA|BLA only.
 */

// Tolerant boundary schema — an upstream rename degrades to zero
// prospects, never a crash.
const submissionSchema = z
  .object({
    submission_type: z.string().optional(),
    submission_number: z.string().optional(),
    submission_status: z.string().optional(),
    submission_status_date: z.string().optional(),
  })
  .loose();

const productSchema = z
  .object({
    brand_name: z.string().optional(),
    dosage_form: z.string().optional(),
    route: z.string().optional(),
    marketing_status: z.string().optional(),
  })
  .loose();

const applicationSchema = z
  .object({
    application_number: z.string(),
    sponsor_name: z.string().optional(),
    submissions: z.array(submissionSchema).optional(),
    products: z.array(productSchema).optional(),
  })
  .loose();

const responseSchema = z
  .object({
    results: z.array(z.unknown()).optional(),
  })
  .loose();

const APPLICATION_TYPES = new Set(["NDA", "ANDA", "BLA"]);

function parseStatusDate(raw: string | undefined): Date | undefined {
  if (!raw || !/^\d{8}$/.test(raw)) return undefined;
  const d = new Date(
    `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T00:00:00Z`,
  );
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Pure parser — the unit-tested half. One prospect per application:
 * the latest approved ORIG/SUPPL submission wins. */
export function parseOpenFdaResponse(json: unknown): DiscoveredProspect[] {
  const parsed = responseSchema.safeParse(json);
  if (!parsed.success || !parsed.data.results) return [];

  const out: DiscoveredProspect[] = [];
  for (const row of parsed.data.results) {
    const app = applicationSchema.safeParse(row);
    if (!app.success) continue;
    const { application_number, sponsor_name, submissions, products } =
      app.data;

    const appType = application_number.replace(/\d.*$/, "");
    if (!APPLICATION_TYPES.has(appType)) continue;
    if (!sponsor_name?.trim()) continue;

    // Latest approved submission for this application
    const approved = (submissions ?? [])
      .filter((s) => s.submission_status === "AP")
      .sort((a, b) =>
        (a.submission_status_date ?? "").localeCompare(
          b.submission_status_date ?? "",
        ),
      );
    const latest = approved[approved.length - 1];
    if (!latest) continue;

    const product = products?.[0];
    const brand = product?.brand_name ?? "unnamed product";
    const isOrig = latest.submission_type === "ORIG";

    out.push({
      externalId: `${application_number}:${latest.submission_type ?? "?"}${latest.submission_number ?? ""}`,
      name: sponsor_name.trim(),
      triggerReason: `FDA approval — ${brand} (${(product?.dosage_form ?? "unknown form").toLowerCase()})`,
      category: "pharma",
      triggeredAt: parseStatusDate(latest.submission_status_date),
      raw: {
        applicationNumber: application_number,
        submissionType: latest.submission_type,
        submissionNumber: latest.submission_number,
        brandName: product?.brand_name,
        dosageForm: product?.dosage_form,
        route: product?.route,
        marketingStatus: product?.marketing_status,
        isOriginal: isOrig,
      },
    });
  }
  return out;
}

const fmt = (d: Date) => d.toISOString().slice(0, 10).replaceAll("-", "");

export const openFdaSource: ProspectSource = {
  id: "fda",
  label: "FDA drug approvals",

  isConfigured() {
    return true; // keyless; OPENFDA_API_KEY only raises rate limits
  },

  async fetchBatch(ctx: SourceContext): Promise<SourceResult> {
    const today = new Date();
    // ~3-day overlap: openFDA backfills records late
    const defaultSince = new Date(today.getTime() - 30 * 86_400_000);
    const sinceDate = ctx.since
      ? new Date(
          `${ctx.since.slice(0, 4)}-${ctx.since.slice(4, 6)}-${ctx.since.slice(6, 8)}T00:00:00Z`,
        )
      : defaultSince;
    const overlapped = new Date(sinceDate.getTime() - 3 * 86_400_000);

    const search = `submissions.submission_status:"AP"+AND+submissions.submission_status_date:[${fmt(overlapped)}+TO+${fmt(today)}]`;
    const apiKey = process.env.OPENFDA_API_KEY;

    const prospects: DiscoveredProspect[] = [];
    const warnings: string[] = [];
    let skip = 0;
    let truncated = false;

    while (prospects.length < ctx.limit) {
      const pageSize = 100;
      const url =
        `https://api.fda.gov/drug/drugsfda.json?search=${search}` +
        `&sort=submissions.submission_status_date:asc&limit=${pageSize}&skip=${skip}` +
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

      const batch = parseOpenFdaResponse(json);
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
      // Watermark only advances on success — and only when not truncated,
      // so a capped window is re-polled from the same point.
      cursor: truncated ? undefined : fmt(today),
      shared: true,
      warnings,
      truncated,
    };
  },
};
