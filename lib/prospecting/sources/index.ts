import type { ProspectSource } from "./types";
import { openFdaSource } from "./openfda";
import { openFdaDeviceSource } from "./openfda-device";
import { createOsmSource, type OsmConfig } from "./osm";
import { createPlacesSource, type PlacesQueryConfig } from "./places";
import { createPermitSource, type PermitFeedConfig } from "./permit";
import { type SourceId } from "./meta";

/**
 * Everything the registry may need to build a connector, in one bag.
 * A per-source config block belongs here rather than as another
 * positional parameter — `getSource` has three call sites.
 */
export type SourceConfigs = {
  places: PlacesQueryConfig;
  osm: OsmConfig;
  permit?: PermitFeedConfig;
};

/**
 * The single mapping from stored org config → connector config. Every
 * caller uses this, so a new field can't be wired in one place and
 * forgotten in another.
 */
export function sourceConfigsFrom(config: {
  placesQueries: string[];
  osmCategories: string[];
  market?: { center?: { lat: number; lng: number }; radiusMeters?: number };
  permitSource?: PermitFeedConfig;
}): SourceConfigs {
  return {
    places: {
      queries: config.placesQueries,
      center: config.market?.center,
      radiusMeters: config.market?.radiusMeters,
    },
    osm: {
      categories: config.osmCategories,
      center: config.market?.center,
      radiusMeters: config.market?.radiusMeters,
    },
    permit: config.permitSource,
  };
}

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
  configs: SourceConfigs,
): ProspectSource {
  switch (id) {
    case "fda":
      return openFdaSource;
    case "fda_device":
      return openFdaDeviceSource;
    case "places":
      return createPlacesSource(configs.places);
    case "osm":
      return createOsmSource(configs.osm);
    case "permit":
      return createPermitSource(configs.permit);
  }
}
