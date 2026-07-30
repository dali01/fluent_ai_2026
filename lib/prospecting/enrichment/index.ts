import { ApolloEnrichmentProvider, StubEnrichmentProvider } from "./providers";

/**
 * Contact enrichment abstraction — mirrors lib/notifications/index.ts:
 * provider by env, never-throws wrapper. Unset APOLLO_API_KEY → stub,
 * no paid calls. docs/prospecting.md §5.
 */

export type EnrichmentQuery = {
  companyName: string;
  website?: string;
  city?: string;
  country?: string;
};

export type EnrichedContact = {
  name?: string;
  email?: string;
  phone?: string;
  title?: string;
  provider: string;
};

export interface EnrichmentProvider {
  readonly id: string;
  enrich(query: EnrichmentQuery): Promise<EnrichedContact | null>;
}

let provider: EnrichmentProvider | undefined;

export function getEnrichmentProvider(): EnrichmentProvider {
  if (!provider) {
    provider = process.env.APOLLO_API_KEY
      ? new ApolloEnrichmentProvider()
      : new StubEnrichmentProvider();
  }
  return provider;
}

/** Never throws — a failed enrichment must not lose the batch. */
export async function enrichSafe(
  query: EnrichmentQuery,
): Promise<EnrichedContact | null> {
  try {
    return await getEnrichmentProvider().enrich(query);
  } catch (error) {
    console.error("[prospecting] enrichment failed:", error);
    return null;
  }
}
