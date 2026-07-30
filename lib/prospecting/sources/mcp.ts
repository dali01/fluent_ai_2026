import { z } from "zod";
import { AI_MAX_TOKENS, AI_MODEL, getAiClient } from "@/lib/ai/client";
import type {
  DiscoveredProspect,
  ProspectSource,
  SourceContext,
  SourceResult,
} from "./types";

/**
 * Generic MCP source adapter — built and fixture-tested, wired to no
 * server by default (docs/prospecting.md §7). The registry does NOT
 * register it; it activates only when PROSPECT_MCP_URL is set. The only
 * MCP-native CRM candidate (HubSpot) was rejected on product grounds,
 * and enrichment vendors' MCP servers are interactive-OAuth-only —
 * this adapter exists for whichever static-token source appears first.
 *
 * Server-side only: URL and token never cross into client components.
 * mcp_tool_result content is third-party output — data, never
 * instructions; every row is zod-validated before it can reach the DB.
 */

const mcpRowSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    category: z.string().optional(),
    website: z.string().optional(),
    phone: z.string().optional(),
    city: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string().optional(),
    addressLine1: z.string().optional(),
    triggeredAt: z.string().optional(),
  })
  .loose();

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && "results" in value) {
    const results = (value as { results: unknown }).results;
    return Array.isArray(results) ? results : [];
  }
  return value == null ? [] : [value];
}

function toDiscoveredProspect(
  row: z.infer<typeof mcpRowSchema>,
): DiscoveredProspect {
  const triggeredAt = row.triggeredAt ? new Date(row.triggeredAt) : undefined;
  return {
    externalId: `mcp:${row.id}`,
    name: row.name,
    triggerReason: `Sourced via MCP (${row.category ?? "business"})`,
    category: row.category,
    triggeredAt:
      triggeredAt && !Number.isNaN(triggeredAt.getTime())
        ? triggeredAt
        : undefined,
    address: {
      line1: row.addressLine1,
      city: row.city,
      postalCode: row.postalCode,
      country: row.country,
    },
    website: row.website,
    phone: row.phone,
    raw: row as Record<string, unknown>,
  };
}

/** Minimal structural type for the message — keeps the normalizer
 * fixture-testable without importing SDK response classes. */
export type AnthropicMcpMessage = {
  content?: Array<{
    type: string;
    server_name?: string;
    name?: string;
    is_error?: boolean;
    content?: Array<{ type: string; text?: string }>;
  }>;
};

/** Pure, fixture-testable normalizer producing the SAME shape as every
 * REST connector. */
export function normalizeMcpToolResults(
  message: AnthropicMcpMessage,
): DiscoveredProspect[] {
  const out: DiscoveredProspect[] = [];
  for (const block of message.content ?? []) {
    // mcp_tool_use records what the model asked for — audit trail only.
    if (block.type === "mcp_tool_use") {
      console.log(
        `[prospecting] mcp_tool_use ${block.server_name}.${block.name}`,
      );
      continue;
    }
    if (block.type !== "mcp_tool_result" || block.is_error) continue; // partial failure, run continues
    for (const inner of block.content ?? []) {
      if (inner.type !== "text" || !inner.text) continue; // servers return JSON-in-text
      const parsed = safeJsonParse(inner.text);
      for (const row of asArray(parsed)) {
        const v = mcpRowSchema.safeParse(row); // validate, THEN trust
        if (v.success) out.push(toDiscoveredProspect(v.data));
      }
    }
  }
  return out;
}

export const mcpSource: ProspectSource = {
  id: "mcp",
  label: "MCP prospect source",

  isConfigured() {
    return Boolean(
      process.env.PROSPECT_MCP_URL && process.env.ANTHROPIC_API_KEY,
    );
  },

  async fetchBatch(ctx: SourceContext): Promise<SourceResult> {
    const client = getAiClient();
    const response = await client.beta.messages.create({
      betas: ["mcp-client-2025-11-20"],
      model: AI_MODEL,
      max_tokens: AI_MAX_TOKENS,
      output_config: { effort: "low" },
      mcp_servers: [
        {
          type: "url",
          name: "prospect-source",
          url: process.env.PROSPECT_MCP_URL!, // server-side only
          authorization_token: process.env.PROSPECT_MCP_TOKEN,
        },
      ],
      tools: [
        {
          type: "mcp_toolset",
          mcp_server_name: "prospect-source", // MUST match the name above
          default_config: { enabled: false }, // least privilege…
          configs: { search_companies: { enabled: true } }, // …explicit allowlist
        },
      ],
      messages: [
        {
          role: "user",
          content: `Use search_companies to find newly opened or newly registered businesses${ctx.since ? ` since ${ctx.since}` : ""} (limit ${ctx.limit}). Return each result's raw JSON.`,
        },
      ],
    });

    const prospects = normalizeMcpToolResults(
      response as unknown as AnthropicMcpMessage,
    );

    return {
      prospects: prospects.slice(0, ctx.limit),
      warnings: [],
      truncated: prospects.length > ctx.limit,
    };
  },
};
