import type { ProspectSource } from "./types";
import { openFdaSource } from "./openfda";
import { createPlacesSource, type PlacesQueryConfig } from "./places";
import { permitSource } from "./permit";
import { type SourceId } from "./meta";

/**
 * Source registry — plain object, same env-selection idiom as
 * getStorage()/getEmailProvider(). The MCP adapter (sources/mcp.ts) is
 * deliberately NOT registered: it stays built-but-unwired until a
 * static-token MCP source exists (docs/prospecting.md §7).
 *
 * Identities/labels live in ./meta.ts (pure, client-importable); this
 * module constructs connectors and therefore pulls in fetch plumbing.
 */
export {
  SOURCE_IDS,
  SOURCE_ENUM,
  SOURCE_META,
  isSourceId,
  type SourceId,
  type SourceMeta,
} from "./meta";

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
