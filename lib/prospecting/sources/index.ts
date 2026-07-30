import type { ProspectSource } from "./types";
import { openFdaSource } from "./openfda";
import { createPlacesSource, type PlacesQueryConfig } from "./places";
import { permitSource } from "./permit";

/**
 * Source registry — plain object, same env-selection idiom as
 * getStorage()/getEmailProvider(). The MCP adapter (sources/mcp.ts) is
 * deliberately NOT registered: it stays built-but-unwired until a
 * static-token MCP source exists (docs/prospecting.md §7).
 */
export const SOURCE_IDS = ["fda", "places", "permit"] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

export function getSource(
  id: SourceId,
  placesConfig: PlacesQueryConfig,
): ProspectSource {
  switch (id) {
    case "fda":
      return openFdaSource;
    case "places":
      return createPlacesSource(placesConfig);
    case "permit":
      return permitSource;
  }
}

export function isSourceId(value: string): value is SourceId {
  return (SOURCE_IDS as readonly string[]).includes(value);
}
