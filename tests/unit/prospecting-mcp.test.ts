import { describe, expect, it } from "vitest";
import {
  normalizeMcpToolResults,
  type AnthropicMcpMessage,
} from "@/lib/prospecting/sources/mcp";

const fixture: AnthropicMcpMessage = {
  content: [
    {
      type: "mcp_tool_use",
      server_name: "prospect-source",
      name: "search_companies",
    },
    {
      type: "mcp_tool_result",
      is_error: false,
      content: [
        {
          type: "text",
          text: JSON.stringify([
            {
              id: "biz-1",
              name: "Nya Bageriet",
              category: "bakery",
              city: "Jönköping",
              postalCode: "55320",
              addressLine1: "Storgatan 2",
              triggeredAt: "2026-07-20T00:00:00Z",
            },
            { name: "missing id — must be dropped" },
          ]),
        },
      ],
    },
    {
      type: "mcp_tool_result",
      is_error: true, // partial failure — skipped, run continues
      content: [{ type: "text", text: '[{"id":"bad","name":"Should Skip"}]' }],
    },
    {
      type: "mcp_tool_result",
      is_error: false,
      content: [{ type: "text", text: "this is not JSON at all" }],
    },
    { type: "text" }, // model narration — ignored
  ],
};

describe("normalizeMcpToolResults", () => {
  it("extracts only zod-valid rows from successful tool results", () => {
    const out = normalizeMcpToolResults(fixture);
    expect(out).toHaveLength(1);
    expect(out[0].externalId).toBe("mcp:biz-1");
    expect(out[0].name).toBe("Nya Bageriet");
    expect(out[0].address?.postalCode).toBe("55320");
    expect(out[0].triggeredAt?.toISOString().slice(0, 10)).toBe("2026-07-20");
  });

  it("skips is_error results entirely", () => {
    const out = normalizeMcpToolResults(fixture);
    expect(out.find((p) => p.name === "Should Skip")).toBeUndefined();
  });

  it("tolerates non-JSON text and empty messages", () => {
    expect(normalizeMcpToolResults({})).toEqual([]);
    expect(
      normalizeMcpToolResults({
        content: [
          {
            type: "mcp_tool_result",
            content: [{ type: "text", text: "garbage" }],
          },
        ],
      }),
    ).toEqual([]);
  });

  it("unwraps { results: [...] } envelopes", () => {
    const out = normalizeMcpToolResults({
      content: [
        {
          type: "mcp_tool_result",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                results: [{ id: "r1", name: "Wrapped" }],
              }),
            },
          ],
        },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].externalId).toBe("mcp:r1");
  });
});
