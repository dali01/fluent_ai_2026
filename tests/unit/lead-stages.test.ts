import { describe, expect, it } from "vitest";
import {
  ALL_LEAD_STAGES,
  LEAD_STAGES,
  PROSPECT_STAGES,
} from "@/lib/validation/crm";

describe("lead stage sets", () => {
  it("keeps prospect stages OFF the kanban stage list", () => {
    for (const stage of PROSPECT_STAGES) {
      expect(LEAD_STAGES).not.toContain(stage);
    }
  });

  it("keeps the kanban at exactly the six pipeline stages", () => {
    expect(LEAD_STAGES).toHaveLength(6);
  });

  it("ALL_LEAD_STAGES is the disjoint union", () => {
    expect(ALL_LEAD_STAGES).toHaveLength(
      LEAD_STAGES.length + PROSPECT_STAGES.length,
    );
    expect(new Set(ALL_LEAD_STAGES).size).toBe(ALL_LEAD_STAGES.length);
  });
});
