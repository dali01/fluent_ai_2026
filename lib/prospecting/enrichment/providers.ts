import { z } from "zod";
import { fetchJson } from "../http";
import type {
  EnrichedContact,
  EnrichmentProvider,
  EnrichmentQuery,
} from "./index";

const apolloResponseSchema = z
  .object({
    person: z
      .object({
        name: z.string().optional(),
        title: z.string().optional(),
        email: z.string().optional(),
        phone_numbers: z
          .array(z.object({ raw_number: z.string().optional() }).loose())
          .optional(),
      })
      .loose()
      .nullable()
      .optional(),
  })
  .loose();

/** Apollo people-match via REST — no vendor SDK (ResendEmailProvider
 * precedent), through the shared retry helper. */
export class ApolloEnrichmentProvider implements EnrichmentProvider {
  readonly id = "apollo";

  async enrich(query: EnrichmentQuery): Promise<EnrichedContact | null> {
    const json = await fetchJson("https://api.apollo.io/api/v1/people/match", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.APOLLO_API_KEY!,
      },
      body: JSON.stringify({
        organization_name: query.companyName,
        domain: query.website
          ? new URL(query.website).hostname.replace(/^www\./, "")
          : undefined,
        person_titles: ["owner", "founder", "marketing manager", "ceo"],
      }),
    });

    const parsed = apolloResponseSchema.safeParse(json);
    if (!parsed.success || !parsed.data.person) return null;
    const person = parsed.data.person;
    if (!person.name && !person.email) return null;

    return {
      name: person.name,
      email: person.email,
      phone: person.phone_numbers?.[0]?.raw_number,
      title: person.title,
      provider: this.id,
    };
  }
}

/** Dev fallback: deterministic result, zero paid calls — matching
 * Console-email and LocalDisk-storage. */
export class StubEnrichmentProvider implements EnrichmentProvider {
  readonly id = "stub";

  async enrich(query: EnrichmentQuery): Promise<EnrichedContact | null> {
    console.log(`[prospecting] enrichment stub → ${query.companyName}`);
    const slug = query.companyName
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, ".")
      .replaceAll(/^\.|\.$/g, "");
    return {
      name: "Stub Contact",
      email: `owner@${slug || "example"}.example`,
      title: "Owner",
      provider: this.id,
    };
  }
}
