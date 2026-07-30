import { describe, expect, it } from "vitest";
import { prospectingConfigSchema } from "@/lib/db/org-settings";
import { screenProspect } from "@/lib/prospecting/relevance";
import { SOURCE_WEIGHTS } from "@/lib/prospecting/scoring";
import {
  SOURCE_ENUM,
  SOURCE_IDS,
  SOURCE_META,
  sourceMetaByEnum,
} from "@/lib/prospecting/sources/meta";
import { PROSPECT_SOURCE_FILTERS } from "@/lib/validation/prospecting";
import type { DiscoveredProspect } from "@/lib/prospecting/sources/types";

/**
 * The wiring guard. Adding a discovery source used to require ~16 edits,
 * five of which failed SILENTLY (wrong enum, permanent skip, toggle
 * reset on save, 100% screened out, wrong outreach pitch). Every one of
 * those is asserted here, so the next source either wires up completely
 * or the suite goes red. See DECISIONS.md.
 */

const bareProspect: DiscoveredProspect = {
  externalId: "x1",
  name: "Some Business",
  triggerReason: "test",
  raw: {},
};

describe("source registry is completely wired", () => {
  const config = prospectingConfigSchema.parse(undefined);

  it.each(SOURCE_IDS)("%s has complete metadata", (id) => {
    const meta = SOURCE_META[id];
    expect(meta.id).toBe(id);
    expect(meta.label.length).toBeGreaterThan(0);
    expect(meta.watches.length).toBeGreaterThan(0);
    expect(meta.value.length).toBeGreaterThan(0);
    expect(["name", "location"]).toContain(meta.dedupeMode);
  });

  it.each(SOURCE_IDS)("%s has a per-org toggle", (id) => {
    // Missing → `config.sources[id]` is undefined → the agent is
    // permanently SKIPPED with a misleading "switched off" message.
    expect(typeof config.sources[id]).toBe("boolean");
    expect(config.sources[id]).toBe(SOURCE_META[id].defaultEnabled);
  });

  it.each(SOURCE_IDS)("%s maps to a Prisma enum value", (id) => {
    expect(SOURCE_ENUM[id]).toBe(SOURCE_META[id].enumValue);
  });

  it.each(SOURCE_IDS)("%s has scoring weights", (id) => {
    // Missing → falls back to MANUAL's weights, silently mis-ranking.
    const weights = SOURCE_WEIGHTS[SOURCE_META[id].enumValue];
    expect(weights).toBeDefined();
    const sum =
      weights.recency +
      weights.categoryFit +
      weights.proximity +
      weights.repeatSignal;
    expect(sum).toBeCloseTo(1, 5);
    expect(weights.halfLifeDays).toBeGreaterThan(0);
  });

  it.each(SOURCE_IDS)("%s has a working relevance screen", (id) => {
    // Missing → inherits the local screen, which requires a street
    // address, and the source silently creates nothing forever.
    const verdict = screenProspect(SOURCE_META[id].relevance, bareProspect);
    expect(typeof verdict.relevant).toBe("boolean");
    expect(verdict.reason.length).toBeGreaterThan(0);
  });

  it.each(SOURCE_IDS)("%s is filterable in the UI", (id) => {
    expect(PROSPECT_SOURCE_FILTERS).toContain(SOURCE_META[id].enumValue);
  });

  it.each(SOURCE_IDS)("%s has a badge colour and outreach angle", (id) => {
    const meta = SOURCE_META[id];
    // Both used to be parallel Record<string,string> maps; a missing key
    // rendered an unstyled badge and silently pitched the Places angle.
    expect(meta.badgeClass).toMatch(/text-/);
    expect(meta.outreachAngle.length).toBeGreaterThan(40);
  });

  it.each(SOURCE_IDS)("%s is reachable by its enum value", (id) => {
    // The UI reads rows back by enum, not by id.
    expect(sourceMetaByEnum(SOURCE_META[id].enumValue)?.id).toBe(id);
  });

  it("proximity carries no weight anywhere until geocoding exists", () => {
    // ingest never passes a proximity value, so a nonzero weight would
    // be unreachable points that silently cap the score.
    for (const weights of Object.values(SOURCE_WEIGHTS)) {
      expect(weights.proximity).toBe(0);
    }
  });

  it("every source id is unique and lower_snake_case", () => {
    expect(new Set(SOURCE_IDS).size).toBe(SOURCE_IDS.length);
    for (const id of SOURCE_IDS) expect(id).toMatch(/^[a-z][a-z0-9_]*$/);
  });
});
