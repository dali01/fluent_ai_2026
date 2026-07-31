import { describe, expect, it } from "vitest";
import { normalizeExtraction, type RfqExtraction } from "@/lib/ai/rfq";

const base: RfqExtraction = {
  companyName: "Nordic Bistro Group",
  contactName: "Maja Berg",
  contactEmail: "maja@nordicbistro.example",
  dueDate: null,
  rush: false,
  lines: [
    {
      description: "A5 flyers",
      quantity: 2500,
      sizeName: "A5",
      widthMm: null,
      heightMm: null,
      stock: "silk",
      colorMode: "CMYK",
      finish: "folded once",
      binding: null,
    },
  ],
  assumptions: [],
  clarifications: [],
};

describe("normalizeExtraction", () => {
  it("keeps a full ISO date", () => {
    const out = normalizeExtraction({ ...base, dueDate: "2026-08-14" });
    expect(out.dueDate).toBe("2026-08-14");
    expect(out.clarifications).toHaveLength(0);
  });

  it("keeps null when no deadline was stated", () => {
    expect(normalizeExtraction(base).dueDate).toBeNull();
  });

  it("refuses prose in the date field and asks instead", () => {
    // A real enquiry said "by the 14th" and the model returned exactly
    // that — which would otherwise flow into Job.dueDate.
    const out = normalizeExtraction({ ...base, dueDate: "the 14th" });
    expect(out.dueDate).toBeNull();
    expect(out.clarifications[0]).toContain("the 14th");
    expect(out.clarifications[0]).toContain("exact deadline");
  });

  it("refuses a partial date rather than inventing a month", () => {
    expect(normalizeExtraction({ ...base, dueDate: "2026-08" }).dueDate).toBeNull();
    expect(normalizeExtraction({ ...base, dueDate: "14/8" }).dueDate).toBeNull();
  });

  it("preserves existing clarifications behind the new one", () => {
    const out = normalizeExtraction({
      ...base,
      dueDate: "next Friday",
      clarifications: ["What paper weight?"],
    });
    expect(out.clarifications).toHaveLength(2);
    expect(out.clarifications[1]).toBe("What paper weight?");
  });

  it("touches nothing else", () => {
    const out = normalizeExtraction({ ...base, dueDate: "soon" });
    expect(out.lines).toEqual(base.lines);
    expect(out.companyName).toBe("Nordic Bistro Group");
  });
});
