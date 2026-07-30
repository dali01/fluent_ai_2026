/** The single shape every connector produces. The pipeline knows nothing
 * else. See docs/prospecting.md §2. */
export type DiscoveredProspect = {
  externalId: string;
  name: string; // business name, or sponsor name for FDA
  triggerReason: string; // shown verbatim in the UI
  category?: string;
  triggeredAt?: Date; // when the event happened — the recency input
  address?: {
    line1?: string;
    city?: string;
    postalCode?: string;
    country?: string;
  };
  website?: string;
  phone?: string;
  raw: Record<string, unknown>; // → Lead.signal; read by the relevance filter
};

export type SourceContext = {
  since?: string; // cursor from the last successful run
  limit: number; // hard cap — the connector MUST stop here
  signal: AbortSignal;
};

export type SourceResult = {
  prospects: DiscoveredProspect[];
  cursor?: string; // persisted on success; omit to leave the watermark
  shared?: boolean; // tenant-independent (openFDA) → fetch once, fan out
  warnings: string[];
  truncated: boolean;
};

export interface ProspectSource {
  readonly id: string;
  readonly label: string;
  /** false when env missing → run is SKIPPED, not FAILED */
  isConfigured(): boolean;
  fetchBatch(ctx: SourceContext): Promise<SourceResult>;
}
