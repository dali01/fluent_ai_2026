# Prospecting & Lead Sourcing — Phase 8 Design Spec

Status: **designed, not yet implemented.** Implementation branches off
`main` as `phase-8-prospecting`; the sequence is at the bottom. This doc
is the contract — `DECISIONS.md` gets its dated Phase 8 section at
implementation time, summarizing what shipped.

## Context

The only prior written plan for this feature was one line in
[TODO-FUTURE.md](../TODO-FUTURE.md): _"Lead sourcing connectors —
ingestion interface + stub connector in Phase 8; real scraping of
business registrations/permits is future work."_

The actual ask is a full production pipeline: discover prospects from
new-business signals and new FDA drug approvals, enrich, score, dedupe,
and write them into the CRM. That is substantially more than "interface +
stub", and it depends on Phase 8 infrastructure that does not exist yet —
there is no `lib/jobs/`, no `app/api/cron/`, no `lib/ai/`, and
`CRON_SECRET` has been documented in `.env.example` since Phase 0 but is
read by nothing.

### Decisions locked

| Question     | Call                                                                   |
| ------------ | ---------------------------------------------------------------------- |
| Data model   | **Extend the existing `Lead` table** (not a separate `Prospect` model) |
| Pilot market | **Configurable per-org** via `Organization.settings`; seed one market  |
| Enrichment   | **Interface + real Apollo provider**, plus a no-cost stub for dev      |
| Sequencing   | **Plan first, implement after Phase 7** (merged as PR #9)              |

On extending `Lead`: the lifecycle concern was raised and the extend
decision stands; §1a is the mitigation that makes it safe — the
load-bearing part of the schema section, not an afterthought.

### Three corrections to the original brief, carried into the design

1. **This is not a React + Node/Express app.** It is Next.js 16 App
   Router with server actions and (today) exactly one route handler;
   there is no Express layer. Ingestion runs as `app/api/cron/*` route
   handlers, and all writes go through server actions per the documented
   convention.
2. **Apollo, ZoomInfo, and Clay do have remote MCP servers today** — the
   brief said otherwise. But they authenticate by interactive OAuth per
   user, and the Messages API MCP connector accepts only a static URL
   plus an optional bearer token. An unattended cron job has no user
   present to consent. REST behind an interface is therefore correct for
   enrichment _because of the auth model_, not because the servers don't
   exist. Any of them shipping static-token auth makes
   `McpEnrichmentProvider` a drop-in fourth implementation.
3. **HubSpot sync does not belong in this project.** Fluent AI _is_ the
   CRM; there is not one reference to HubSpot anywhere in the repo.
   Syncing would mean two CRMs with no ownership story, and tenant
   isolation — described as sacred at the top of `schema.prisma` —
   cannot cross that boundary with a single static bearer token. The MCP
   requirement is met instead by a **generic MCP source adapter** (§7):
   real, tested against fixtures, wired to no server by default.

Also worth knowing:
`node_modules/next/dist/docs/01-app/02-guides/mcp.md` is about
`next-devtools-mcp`, which exposes _your dev server_ to _coding agents_.
It has nothing to do with being an MCP client. Easy to conflate; don't.

---

## 1. Schema

Extending `Lead`. The honest cost: ~16 new columns that are null for
every human-created lead, and three query call sites that must learn to
filter. §1a is what contains that.

**New enums:**

```prisma
enum ProspectSource   { PLACES  PERMIT  FDA  MANUAL }
enum EnrichmentStatus { NOT_REQUIRED  PENDING  ENRICHED  FAILED  SKIPPED }
enum SourceRunStatus  { RUNNING  SUCCEEDED  PARTIAL  FAILED  SKIPPED }
```

**Two new `LeadStage` values** — appended, never inserted (Postgres enum
ordering is positional):

```prisma
enum LeadStage {
  QUOTE_REQUESTED  QUOTED  APPROVED  IN_PRODUCTION  DELIVERED  REPEAT
  PROSPECT        // cold, sourced, not yet qualified — never on the kanban
  DISQUALIFIED    // reviewed and rejected; retained for dedupe suppression
}
```

**New `Lead` columns:**

```prisma
  prospectSource   ProspectSource   @default(MANUAL)
  triggerReason    String?          // "New business licence 2026-07-14" | "FDA approval — Brand X (tablet)"
  category         String?
  externalId       String?          // place_id | permit no | "NDA021436:ORIG1"
  normalizedName   String?          // dedupe key (§4)
  locationKey      String?          // name+street+postal; NULL for FDA (no address)
  addressLine1     String?
  city             String?
  postalCode       String?
  country          String?
  website          String?
  phone            String?
  contactName      String?          // ↓ enrichment output
  contactEmail     String?
  contactPhone     String?
  contactTitle     String?
  enrichmentStatus EnrichmentStatus @default(NOT_REQUIRED)
  enrichmentProvider String?
  enrichedAt       DateTime?
  score            Int?             // 0–100, deterministic (§6)
  scoreBreakdown   Json?
  rationale        String?
  signal           Json?            // verbatim source payload
  triggeredAt      DateTime?        // when the event happened (approval/permit date)
  discoveredAt     DateTime?

  @@unique([organizationId, prospectSource, externalId])
  @@index([organizationId, normalizedName])
  @@index([organizationId, locationKey])
  @@index([organizationId, stage, score])
```

Source-specific fields live in `signal`, not columns — for FDA that is
`{ applicationNumber, submissionType, brandName, dosageForm, route,
marketingStatus }`. This keeps the table from growing a column per
source and lets the relevance filter be re-run and audited against the
original payload.

`triggeredAt` is deliberately separate from `discoveredAt`: recency
scoring must decay from when the _event_ happened, not when the cron
happened to notice it.

**`@@unique([organizationId, prospectSource, externalId])` is the
idempotency guard**, which makes a retried or double-fired cron a no-op.
Postgres treats NULLs as distinct, so the many `MANUAL` leads with a
null `externalId` never collide — desired, since manual leads need no
dedupe. Every connector can synthesize a stable `externalId`: Places
`place.id`, openFDA `${application_number}:${submission_type}${submission_number}`,
permits the permit number or a row hash.

**New model** `SourceRun` — run history _and_ the per-source watermark:

```prisma
/// One row per (org, source, run). Doubles as the delta watermark (cursor of
/// the last SUCCEEDED run) and the unattended-failure record. Status mutates
/// once, RUNNING → terminal, exactly like AiTask.status.
model SourceRun {
  id             String          @id @default(cuid())
  organizationId String
  source         ProspectSource
  status         SourceRunStatus @default(RUNNING)
  cursor         String?         // opaque per-source watermark (openFDA: YYYYMMDD)
  fetched        Int             @default(0)
  created        Int             @default(0)
  duplicates     Int             @default(0)
  screenedOut    Int             @default(0)
  enriched       Int             @default(0)
  error          String?
  warnings       Json?
  startedAt      DateTime        @default(now())
  finishedAt     DateTime?

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId, source, startedAt])
}
```

**Why `SourceRun` holds the watermark rather than
`Organization.settings`:** `Organization` is a global model that
`tenantDb` refuses (`lib/db/tenant-scope.ts`), so writing a watermark
there needs a raw-client escape hatch. Beyond that, read-modify-write on
one shared JSON blob loses updates when two sources run concurrently,
keeps no history, and is unindexable. `SourceRun` answers three
questions with one append-only-ish table: what is the cursor, what
failed, and when did each source last run. Market _config_ is genuinely
settings and stays in `Organization.settings` (§3).

Watermark read: `findFirst({ where: { source, status: { in:
["SUCCEEDED", "PARTIAL"] } }, orderBy: { startedAt: "desc" }, select: {
cursor: true } })`. **It advances only on success**, so a failed window
is automatically re-polled — safe because writes are idempotent.

**Must not forget:** add `"SourceRun"` to `TENANT_MODELS` in
[lib/db/tenant-scope.ts](../lib/db/tenant-scope.ts), in the **same
commit** as the schema change. The tenant layer fails closed on unknown
models, so every query against the new table throws
`TenantIsolationError` until it is registered. Also add
`sourceRuns SourceRun[]` to `Organization`.

**Migration** — generate offline per the Phase 1 precedent, diffing from
existing migrations rather than from empty:

```bash
pnpm exec prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/<timestamp>_prospecting/migration.sql
```

All added `Lead` columns are nullable or defaulted, so it is a safe
forward-only migration. One caveat: Prisma wraps each migration in a
transaction and a newly added enum value cannot be _used_ by other
statements in the same transaction — safe here because nothing backfills
the new `LeadStage` values, but keep any future
`ALTER TYPE ... ADD VALUE` in its own migration directory. And run
`pnpm prisma generate` after this commit — `lib/generated/prisma` is
gitignored, so the pre-commit `typecheck` fails on the new types
otherwise.

### 1a. Keeping cold prospects out of the pipeline — the three call sites

`LEAD_STAGES` in [lib/validation/crm.ts](../lib/validation/crm.ts)
drives the kanban columns, the stage-move validator, and the dashboard.
**Leave it as exactly the six kanban stages** and add siblings:

```ts
export const PROSPECT_STAGES = ["PROSPECT", "DISQUALIFIED"] as const;
export const ALL_LEAD_STAGES = [...LEAD_STAGES, ...PROSPECT_STAGES] as const;
```

Because `LEAD_STAGES` is untouched, `STAGE_LABELS` / `STAGE_DOTS` /
`StageColumn` in
[components/crm/pipeline-board.tsx](../components/crm/pipeline-board.tsx)
keep type-checking with no edit, and `moveLeadStage`
([lib/actions/leads.ts](../lib/actions/leads.ts)) already validates
against `LEAD_STAGES` — so a card can never be dragged _into_
`PROSPECT`. That guard comes free.

Three edits:

- [app/(app)/pipeline/page.tsx](<../app/(app)/pipeline/page.tsx>) —
  `db.lead.findMany({ where: { deletedAt: null } })` has **no stage
  filter and no `take`**. Add `stage: { in: LEAD_STAGES }`. Without it,
  hundreds of Places rows land on a hand-curated board through an
  unpaginated query mapped into a client component — a correctness _and_
  performance cliff. Adding `take` while here is cheap insurance.
- [app/(app)/dashboard/page.tsx](<../app/(app)/dashboard/page.tsx>) —
  currently `stage: { notIn: ["DELIVERED", "REPEAT"] }`, which would
  pull prospects into both the "Open pipeline" money total and
  `stageCounts`. Change to `stage: { in: LEAD_STAGES }` and keep the
  existing exclusion.
- A vitest case asserting `PROSPECT ∉ LEAD_STAGES` prevents the
  regression cheaply.

**Dismissal uses `DISQUALIFIED`, not `deletedAt`** — and the dedupe
candidate query must **not** filter `deletedAt: null`. A rejected
prospect has to keep suppressing re-ingestion, or every nightly run
resurrects everything the user rejected. This is a deliberate deviation
from the "Archive, not delete / lists filter deletedAt" convention and
belongs in `DECISIONS.md`.

## 2. The source connector interface

One abstraction, and it is the one that earns its keep: it is what lets
a REST source be swapped for MCP without the pipeline noticing.
`lib/prospecting/sources/types.ts`:

```ts
/** The single shape every connector produces. The pipeline knows nothing else. */
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
  isConfigured(): boolean; // false when env missing → run is SKIPPED, not FAILED
  fetchBatch(ctx: SourceContext): Promise<SourceResult>;
}
```

`sources/index.ts` is a plain object literal, the same env-selection
idiom as `getStorage()` / `getEmailProvider()`. No `BaseSource` class,
no capability descriptors, no plugin loader — connectors are object
literals.

**Every connector splits into `fetchBatch` (I/O) and a pure exported
`parseXResponse(json): DiscoveredProspect[]`.** Only the parser is
unit-tested, so no test touches the network — the same discipline that
makes `lib/pricing/engine.ts` and `lib/prepress/checks.ts` testable.

`shared: true` matters for cost: FDA data is tenant-independent, so N
tenants must not mean N polls. The runner fetches once and fans the
batch out across orgs.

## 3. Per-org market config

`Organization.settings` is `Json @default({})` and unused — this is its
purpose. Under a `prospecting` key, zod-validated on read:

```ts
{ prospecting: {
    enabled: boolean,
    market: { country, city, center: { lat, lng }, radiusMeters },
    placesQueries: string[],                 // category × sub-tile query list
    permitSource: { url, termsUrl, recordIdField, nameField, addressFields,
                    dateField, dateFormat, categoryField },
    fda: { enabled, dosageFormAllowlist: string[], applicationTypes: string[] },
    scoreWeights: Partial<ScoreWeights>,
    enrichment: { minScore: number, maxPerRun: number },
} }
```

`permitSource` is how a new pilot market is onboarded with no code
change — supply the URL and field names. `termsUrl` is a **required**
field, which makes the "public data and licensed APIs only" constraint
an enforced part of the config rather than a comment.

`Organization` is refused by `tenantDb`, so this needs
`lib/db/org-settings.ts` — a small documented raw-client helper,
following the precedent already set and documented for
`resolvePortalToken` ([lib/portal/auth.ts](../lib/portal/auth.ts)). Copy
that file's "this is the ONE place…" header-comment style.

Edited via a settings form using the **double validation** pattern
`DECISIONS.md` Phase 4 specifies for pricing-rule configs: `JSON.parse`
then zod.

## 4. Dedupe — two paths, pure, tested

`lib/prospecting/normalize.ts` and `lib/prospecting/dedupe.ts`, both
pure (no Prisma import):

```ts
export function normalizeBusinessName(raw: string): string;
export function nameKey(raw: string): string;
export function locationKey(
  name: string,
  line1?: string,
  postal?: string,
): string | null;
export function isLikelySameName(a: string, b: string): boolean;
export function classify(
  p: DiscoveredProspect,
  idx: DedupeIndex,
  mode: "location" | "name",
): Verdict;
```

`normalizeBusinessName`: casefold, NFKD-strip diacritics, `&`→`and`,
drop leading `the`, drop punctuation, **strip legal-form suffixes**
(`inc llc ltd limited corp co company plc gmbh ab hb kb oy as a/s sa nv
bv`), collapse whitespace. Persisted to `Lead.normalizedName` so
matching is an indexed query.

**The subtle rule:** strip legal suffixes but **never strip industry
tokens** (`pharma pharms pharmaceuticals labs laboratories therapeutics
biosciences`). Those tokens are exactly what distinguishes "Alpha
Therapeutics" from "Alpha Logistics"; stripping them collapses unrelated
sponsors into one.

**Local path (Places, permits) — identity is place + address:**

1. `externalId` hit → duplicate (re-observation; append the signal, bump
   `discoveredAt`, no new row)
2. `locationKey` hit → duplicate
3. name alone is **not** sufficient — two "Nordic Bakery" branches are
   two prospects

**FDA path — identity is the name alone, since a sponsor has no local
address:**

- `externalId` hit → duplicate (same approval seen twice)
- else `nameKey` equality or `isLikelySameName` (token-set equality
  after suffix stripping) against existing `Company` names → duplicate.
  This is what makes "Teva Pharmaceuticals USA, Inc." match an existing
  `TEVA PHARMS USA` customer.
- location is never consulted, and `locationKey` is `NULL` for FDA rows
  by construction, so the FDA path cannot accidentally match on address.

A confident FDA match against an existing customer is the interesting
case: attach the approval as a signal on that company and screen the
prospect out with reason "already a customer". An existing customer with
a new approval is a warm upsell, not a cold lead.

Duplicates are **not written at all**; the count lands in
`SourceRun.duplicates`. DB access stays outside the pure module: one run
loads a narrow index (`lead.findMany` on keys — _without_ the
`deletedAt` filter, per §1a — plus `company.findMany({ where: {
deletedAt: null }, select: { id, name, addressLine1, postalCode } })`)
and normalizes in memory. At print-shop scale that is one cheap query.
No denormalized `Company.nameKey` column: it would mean a migration on a
live table, a backfill, and keeping it in sync in
`lib/actions/companies.ts` forever. `pg_trgm` goes to `TODO-FUTURE.md`.

Tests (`tests/unit/prospecting-dedupe.test.ts`,
`prospecting-normalize.test.ts`): diacritics, suffix variants, `"The
Print Co."` vs `"print"`, same name + different postal (must NOT match),
place_id re-observation, the Teva sponsor variants, industry-token cases
that must stay distinct, FDA rows never location-matched, and
idempotence (`f(f(x)) === f(x)`).

## 5. Relevance filter and the enrichment gate

`lib/prospecting/relevance.ts` — pure, and **fails closed**: unknown
input means not relevant, which means no money spent.

- **Local:** category allowlist (bakery, café, restaurant, brewery,
  salon, clinic, real-estate, boutique…), denylist (national chains and
  other print shops — competitors), address present and inside the
  pilot-market bounds.
- **FDA:** dosage form and marketing status decide patient-facing
  packaging demand versus internal clinical documentation. Relevant:
  tablet, capsule, oral solution/suspension, cream, ointment, gel,
  spray, patch, inhalant, prefilled injection — combined with
  `marketing_status ∈ {Prescription, Over-the-counter}`. These need
  cartons, inserts, blister foil, pharmacy labels. Screened out: bulk
  "for further manufacturing use", powder-for-reconstitution hospital
  presentations, discontinued. `ORIG` submissions weigh above `SUPPL`.
  Missing or unrecognized `dosage_form` → not relevant.

`lib/prospecting/gate.ts` — pure, three conditions all required:
relevance passed, `score >= minScore`, and budget remaining. A gate
failure becomes `SKIPPED`; budget exhaustion becomes `PENDING` so the
next run picks it up. Having both `maxPerRun` and a `minScore` is what
makes that deferral meaningful.

`lib/prospecting/enrichment/index.ts` mirrors
[lib/notifications/index.ts](../lib/notifications/index.ts) line for
line, including the never-throws wrapper:

```ts
export interface EnrichmentProvider {
  readonly id: string;
  enrich(query: EnrichmentQuery): Promise<EnrichedContact | null>;
}

export function getEnrichmentProvider(): EnrichmentProvider {
  if (!provider) {
    provider = process.env.APOLLO_API_KEY
      ? new ApolloEnrichmentProvider()
      : new StubEnrichmentProvider();
  }
  return provider;
}

/** Never throws — a failed enrichment must not lose the batch. */
export async function enrichSafe(
  q: EnrichmentQuery,
): Promise<EnrichedContact | null>;
```

`ApolloEnrichmentProvider` — `POST
https://api.apollo.io/api/v1/people/match`, `x-api-key` header, plain
`fetch` through the shared retry helper. No vendor SDK, per the
`ResendEmailProvider` precedent. `StubEnrichmentProvider` logs
`[prospecting] enrichment stub → <name>` and returns a deterministic
result, so the whole pipeline and the smoke script run offline with
nothing paid — matching Console-email and LocalDisk-storage.

## 6. Scoring — deterministic; Claude explains, never decides

`lib/prospecting/scoring.ts`, in the style of
[lib/pricing/engine.ts](../lib/pricing/engine.ts) — exported weight
tables, and a result carrying per-factor contributions and reasons so
nothing is ever silently ignored:

```ts
export const SOURCE_WEIGHTS: Record<ProspectSource, ScoreWeights>;
export function scoreProspect(input: ScoreInput): {
  score: number; // 0–100 Int
  factors: ScoreFactor[]; // { factor, points, detail } — sums to score
  rationale: string; // assembled from factors, no model call
};
```

`now` is an injected input, never `Date.now()` inside — that is what
makes it testable.

Per-trigger weights, config-overridable:

| Trigger                | recency | category / product fit | proximity                             | repeat signal | half-life |
| ---------------------- | ------- | ---------------------- | ------------------------------------- | ------------- | --------- |
| New business / licence | 0.45    | 0.35                   | 0.15                                  | 0.05          | 30 d      |
| FDA approval           | 0.35    | 0.45                   | — (nationwide; skipped with a reason) | 0.20          | 45 d      |
| Places discovery       | 0.15    | 0.55                   | 0.20                                  | 0.10          | 120 d     |

Recency decay is explicit and continuous:
`exp(-ln2 * ageDays / halfLife)`. A new business is a short-fuse signal
— they need signage and cards _now_; an FDA approval has a longer
procurement runway. That difference is precisely why "different signal
types warrant different weights" needs per-trigger weight tables rather
than one global formula. An existing-customer match forces `score = 0`
via an explicit factor, never a silent filter.

**Claude is not in the scoring path.** [DECISIONS.md](../DECISIONS.md)
Phase 3 states it verbatim — _"Claude explains results in Phase 8 — it
never decides them."_ The deterministic `rationale` string is already
sufficient for the UI. Claude's one job here is drafting outreach copy
per trigger type (a "new bakery on Main St" email is nothing like a
"your ANDA just cleared, here is our carton-and-insert capability"
email), via `AiTaskKind.OUTREACH_DRAFT`, which already exists unused in
the enum.

The detail view recomputes the breakdown server-side by calling
`scoreProspect` with the persisted inputs, so displayed and stored
scores cannot diverge — the Phase 4 pricing-engine discipline.

**Outreach is drafted, never sent.** Copy-to-clipboard only.
Cold-sending through `lib/notifications` would repurpose a layer built
for existing-customer comms, inherit `sendEmailSafe`'s never-throws
behaviour so failures would be silently invisible, and pull
CAN-SPAM/GDPR obligations into a module with no consent tracking. This
also matches the landing-page promise: _"reviewed by you, never
auto-sent."_

## 7. AI layer and the MCP integration code

`lib/ai/` is Phase 8's and lands here:

- `lib/ai/client.ts` — lazy `@anthropic-ai/sdk` singleton in the
  `getDb()` style, so `next build` still succeeds with no
  `ANTHROPIC_API_KEY`; an `isAiEnabled()` guard lets jobs skip AI steps
  offline. **Deliberately deviating from the Resend-no-SDK precedent:**
  `client.messages.parse()` + `zodOutputFormat(schema)` are materially
  better than hand-rolling `output_config.format.json_schema`, and zod
  v4 is already a dependency. Record the deviation in `DECISIONS.md`.
- **Opus 5 constraints:** model `claude-opus-5` ($5/$25 per MTok).
  Thinking is **on by default** and `max_tokens` caps thinking + text
  together, so size `max_tokens` generously (16000) rather than to the
  expected paragraph. `temperature`, `top_p`, `top_k`, and
  `budget_tokens` are all **removed and return 400**. No assistant
  prefill (400). Depth via `output_config: { effort: "low" }` — these
  are small structured tasks. Check `stop_reason === "refusal"` before
  reading content. Structured-output limits: `additionalProperties:
false` required on objects, no recursion, no numeric/length
  constraints, and `parsed_output` can be `null`.
- `lib/ai/task.ts` — `runAiTask({ orgId, kind, input, fn })` drives the
  unused `AiTask` model `PENDING → RUNNING → SUCCEEDED|FAILED`, filling
  `model`, `inputTokens`/`outputTokens` from `response.usage`, and
  `costCents = round(inputTokens/1e6*500 + outputTokens/1e6*2500)`.
  Per-org AI spend reporting for free, and the first code to write to
  `AiTask`.

**MCP source adapter** — `lib/prospecting/sources/mcp.ts`. Both halves
are mandatory; `mcp_servers` without a matching `mcp_toolset` is a
validation error, and `mcp_server_name` must equal a declared server's
`name`:

```ts
const res = await client.beta.messages.create({
  betas: ["mcp-client-2025-11-20"],
  model: "claude-opus-5",
  max_tokens: 16000,
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
      configs: [{ name: "search_companies", enabled: true }], // …explicit allowlist
    },
  ],
  messages: [{ role: "user", content: prompt }],
});
```

And the piece that is the actual deliverable — a pure, fixture-testable
normalizer producing the **same** `DiscoveredProspect[]` as every REST
connector:

```ts
export function normalizeMcpToolResults(
  message: AnthropicMessage,
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
      if (inner.type !== "text") continue; // servers return JSON-in-text
      const parsed = safeJsonParse(inner.text); // never throws
      for (const row of asArray(parsed)) {
        const v = mcpRowSchema.safeParse(row); // validate, THEN trust
        if (v.success) out.push(toDiscoveredProspect(v.data));
      }
    }
  }
  return out;
}
```

Three things this gets right. `default_config: { enabled: false }` plus
an explicit allowlist means an unattended job can call exactly the tools
it was authorized for, not everything a third-party server exposes. The
URL and token are read from `process.env` inside a server-only module
and never cross into a client component. And every row is zod-validated
before it can reach the database — `mcp_tool_result` content is
third-party output, so it is **data, never instructions**.

Honest labelling: this is the one speculative file in the plan. It is
accepted because MCP code is an explicit requirement, and the cost is
held at zero configured sources — the registry does not register an MCP
connector, and if `PROSPECT_MCP_URL` is unset the source is skipped
entirely. `DECISIONS.md` records why: the only MCP-native candidate
(HubSpot) was rejected on product grounds, and the enrichment vendors'
MCP servers are interactive-OAuth-only.

Note for `DECISIONS.md`: the MCP connector is unavailable on Bedrock and
Vertex. Irrelevant today because this project calls the Anthropic API
directly — worth recording so nobody "optimizes" the client onto a
cloud provider later and silently breaks MCP.

## 8. Jobs, cron, and unattended-operation hardening

**`lib/jobs/`** — the thinnest slice of Phase 8's job layer. The only
seam that matters for the documented Inngest/Trigger.dev migration is
that **job bodies are plain async functions with no dependency on
`Request`/`Response`**. Everything else is speculation, so: no registry
abstraction, no queue interface.

- `lib/jobs/cron.ts` — `isAuthorizedCronRequest(request)`: constant-time
  compare of `Authorization: Bearer <CRON_SECRET>`, **fail closed when
  the secret is unset**. First code ever to read `CRON_SECRET`.
- `lib/jobs/orgs.ts` — `listActiveOrgIds()`. **This is a second
  documented `getDb()` exception** and must be recorded in
  `DECISIONS.md`, not smuggled in. It is unavoidable: cron has no Clerk
  session so `requireOrg()` is unusable, and `Organization` is refused
  by the tenant client — there is no tenant-scoped way to enumerate
  tenants. Keep it ~15 lines, `select: { id: true }`, with the same
  "this is the ONE place…" comment as
  [lib/portal/auth.ts](../lib/portal/auth.ts).
- `lib/jobs/run.ts` — `runPerOrg(name, orgIds, fn)`: per-org try/catch,
  `console.error("[jobs] …")`, returns `{ ok, failed, results }`. One
  org's failure never aborts another's.

**One route, three schedules** —
`app/api/cron/prospecting/[source]/route.ts`. Three separate files
would be three copies of twelve lines; one dynamic segment plus registry
validation gives the same independent scheduling with less surface. Note
`params` is a Promise in this Next version, matching
[app/api/files/[...key]/route.ts](../app/api/files/[...key]/route.ts).

Two non-obvious choices:

- **Return `404`, not `401`, on a bad secret** — matching the files
  route, which hides existence rather than confirming it.
- **Return HTTP 200 with `{ ok: false, … }` on a failed run.** A 5xx
  makes Vercel Cron retry, turning a bad upstream into a retry storm and
  a doubled API bill. Visibility comes from `SourceRun` and the
  `ActivityLog` row, not the status code.

**`proxy.ts` needs no change for cron — verified.** The matcher runs
`clerkMiddleware` on `/(api|trpc)(.*)`, but `isProtectedRoute` lists
only page routes, so `auth.protect()` never fires on `/api/cron` and the
`CRON_SECRET` check is the gate. **Flag loudly in `DECISIONS.md`: adding
`"/api(.*)"` to `isProtectedRoute` would silently break cron.** Do add
`"/prospects(.*)"` for the new page.

**`vercel.json`** (new file; keep it to `crons` only so it doesn't
fight dashboard settings):

```json
{
  "crons": [
    { "path": "/api/cron/prospecting/fda", "schedule": "0 4 * * *" },
    { "path": "/api/cron/prospecting/permit", "schedule": "30 4 * * *" },
    { "path": "/api/cron/prospecting/places", "schedule": "0 3 * * 1" }
  ]
}
```

Staggered so per-source caps and rate limits never collide. Places is
weekly: the local-business universe barely changes day to day, and each
run costs money. Confirm the Vercel plan tier — Hobby caps cron
frequency and count.

**openFDA delta query** — no auth required:

```
GET https://api.fda.gov/drug/drugsfda.json
  ?search=submissions.submission_status:"AP"
     +AND+submissions.submission_status_date:[{since}+TO+{today}]
  &sort=submissions.submission_status_date:asc&limit=100&skip={n}
```

Four details that matter: dates are `YYYYMMDD`; **re-query with a ~3-day
overlap** because openFDA backfills records late (idempotency comes from
the unique constraint, not from a precise cursor); paginate with `skip`
(`limit` max 1000, use 100 for predictable memory); and emit **one
prospect per application, not per submission**, so a drug with forty
supplements doesn't fan out into forty leads. Filter `submission_type`
to `NDA|ANDA|BLA`. Address is `null` by design — enrichment fills it.
Validate the response with a tolerant zod schema at the boundary so an
upstream field rename degrades to zero prospects rather than a crash.

**Google Places** — `POST
https://places.googleapis.com/v1/places:searchText` (or
`:searchNearby`) with `X-Goog-Api-Key` and an explicit
`X-Goog-FieldMask`. **The field mask is the billing lever** — Places
(New) bills by SKU tier per requested field, so request only what the
pipeline uses. 20 results per call is the hard cap, so market coverage
comes from iterating category × sub-tile queries from config, bounded by
the run cap.

**ToS, made structural rather than aspirational.** Google Maps terms
permit storing `place_id` indefinitely but only limited caching of place
_content_. The design already makes `externalId` the durable key, so the
compliant behaviour is: keep `externalId` forever, treat cached
name/address as refreshable, and set an expiry on the raw `signal`
payload with a purge job in `TODO-FUTURE.md`. openFDA is public and
unrestricted. For permits, `termsUrl` being a required config field
makes pointing the connector at a ToS-prohibited site a visible act
rather than an accident — this ships open-data and licensed-API
ingestion only.

**`lib/prospecting/http.ts`** — ~50 lines, used by every connector _and_
the Apollo provider: retries only on 429/5xx/network, honours
`Retry-After`, exponential backoff with jitter, per-attempt
`AbortSignal.timeout()` composed with the run signal via
`AbortSignal.any`, throws a typed error carrying status plus a body
snippet so `SourceRun.error` is diagnosable. No new dependency. Testable
with an injected fetch and clock. Don't refactor the existing Resend
call onto it — right cleanup, wrong PR.

**Partial-failure isolation, four levels:** per attempt (retries), per
prospect (`enrichSafe` never throws; a bad row becomes `FAILED` and the
batch survives), per org (`runPerOrg`'s try/catch), and per source (one
source per cron path, so a Places outage cannot touch the FDA run). A
truncated or failed run leaves the watermark alone and re-polls next
time.

**Where failures are recorded:**

| Signal                             | Home                                             | Why                                                                                                             |
| ---------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Counters, cursor, error, warnings  | `SourceRun`                                      | Purpose-built; queryable per source over time                                                                   |
| Human-visible one-liner per run    | `ActivityLog` (`type: SYSTEM`, `actorId: null`)  | The documented audit trail; `actorId` null already means system/AI, and it lands in the dashboard feed for free |
| Claude call outcomes, tokens, cost | `AiTask`                                         | Has exactly the right columns                                                                                   |
| Transient detail                   | `console` with `[prospecting]` / `[jobs]` prefix | Matches the `[notifications]` convention; no logger lib                                                         |

Two things not to do: **don't use `AiTask` as a generic job log** —
`model`/`inputTokens`/`costCents` would be meaningless and would corrupt
AI spend reporting. And **don't add new `ActivityType` enum values** —
`SYSTEM` exists; a new value means a migration plus touching
`LOGGABLE_ACTIVITY_TYPES` in `lib/validation/crm.ts` for zero gain.

Also considered and rejected: `after()` exists in this Next build and is
tempting for fire-and-forget enrichment from a server action, but it is
not a queue — no retries, no visibility, dies with the invocation — and
the repo already commits to jobs-behind-an-interface. Record the
rejection.

## 9. UI surface

- **Sidebar** ([components/app-sidebar.tsx](../components/app-sidebar.tsx))
  — one line into the **Sales** group above Pipeline:
  `{ href: "/prospects", label: "Prospects", icon: Radar }`. Prospecting
  is top-of-funnel sales.
- **`proxy.ts`** — add `"/prospects(.*)"` to `isProtectedRoute`. Never
  add `/api`.
- **`app/(app)/prospects/page.tsx`** — async Server Component reading
  inline exactly like the pipeline page: `where: { deletedAt: null,
stage: "PROSPECT", ...filters }`, `orderBy: [{ score: "desc" }, {
discoveredAt: "desc" }]`, **`take: 100`**. Filters from
  `searchParams`, validated with a zod enum. Above the list, a compact
  "last run" strip from the latest `SourceRun` per source — that strip
  is the entire ops surface for unattended operation, and it is what
  makes a silently broken cron obvious.
- **`components/prospecting/prospect-row.tsx`** — one collapsible client
  component exposing the score factors, trigger reason, `signal`
  highlights, enriched contact, and the actions. **No `/prospects/[id]`
  route yet** — nothing links to a prospect from elsewhere. Add it when
  the row outgrows itself. Score badges use `--primary` / `--chart-*` /
  `--muted` tokens; no hex.
- **`lib/actions/prospects.ts`** (`"use server"`) — house shape
  throughout (`requireOrg()` → `parseForm` → `tenantDb` →
  `activityLog.create` → `revalidatePath` → `actionOk`), reusing
  `ActionResult`, `actionOk`, `parseForm`, `idOrNull` from
  [lib/actions/form.ts](../lib/actions/form.ts):
  - `qualifyProspect` — one transaction: create `Company` from the
    prospect's address fields + `Contact` from the enriched fields if
    present, link them, set `stage: "QUOTE_REQUESTED"` so it enters the
    kanban. Reuses the existing `companySchema` / `contactSchema`
    shapes.
  - `disqualifyProspect` — sets `stage: "DISQUALIFIED"`, leaves
    `deletedAt` null (dedupe suppression, §1a).
  - `enrichProspectNow`, `draftProspectOutreach`.
  - `runProspectSourceNow(sourceId)` — manual trigger calling the
    **same** function the cron route calls. This is how the feature is
    testable before cron exists, and the concrete payoff of keeping job
    bodies `Request`-free.
- **Settings** — a prospecting-market form writing
  `Organization.settings.prospecting` through `lib/db/org-settings.ts`,
  using the JSON-parse-then-zod double validation pattern.
- **`lib/validation/prospecting.ts`** — new file alongside `crm.ts` /
  `inventory.ts` / `jobs.ts` / `quotes.ts`.

**Secret handling** (an explicit requirement): every key is read via
`process.env.X` inside `lib/` modules imported only by server actions,
the cron route, and Server Components. No `NEXT_PUBLIC_` prefix on any
of them — that prefix is the only mechanism that could expose them.
Prospect rows shipped to the client component carry display fields only.

## 10. Tests, smoke script, docs

Vitest in `tests/unit/`, all pure, **zero network**, so the Husky
pre-commit hook stays fast:

| File                                                         | Covers                                                                                                           |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `prospecting-normalize.test.ts`                              | diacritics, suffix stripping, idempotence, `locationKey` null without street+postal                              |
| `prospecting-dedupe.test.ts`                                 | both paths; the Teva variants; same-name/different-street distinct; FDA never location-matched                   |
| `prospecting-relevance.test.ts`                              | dosage-form matrix; **unknown form ⇒ not relevant** (fail closed = don't spend)                                  |
| `prospecting-scoring.test.ts`                                | determinism, 0–100 bounds, monotonic recency, per-trigger weights differ, factors sum to score                   |
| `prospecting-openfda.test.ts` / `prospecting-places.test.ts` | the pure parsers against fixtures, plus a malformed payload degrading to `[]`                                    |
| `prospecting-mcp.test.ts`                                    | `normalizeMcpToolResults` over a fixture with `mcp_tool_use`, a good result, `is_error: true`, and non-JSON text |
| `tenant-scope.test.ts` (extend)                              | `SourceRun` registered; `PROSPECT ∉ LEAD_STAGES`                                                                 |

**`scripts/smoke-prospecting.ts`** — mirrors
[scripts/smoke-crm.ts](../scripts/smoke-crm.ts): dotenv
`[".env.local", ".env"]` → `tenantDb(process.env.SEED_ORG_ID ??
"org_demo_fluent")` → run the openFDA source against a fixture → ingest
→ **ingest the identical batch again and assert 0 created, N
duplicates** (the dedupe proof) → assert no prospect appears in the
pipeline-board query → enrich the top prospect with the stub → qualify
one and assert a `Company` and `Lead` exist → assert the `SourceRun` and
`ActivityLog` rows → the cross-tenant probes copied from `smoke-crm.ts`
→ `console.log("SMOKE OK")`. Run as `pnpm exec tsx
scripts/smoke-prospecting.ts` — **don't add a package.json script**;
none of the existing smokes have one.

Extend `prisma/seed.ts` (through `tenantDb`, per the Phase 1 decision)
with a few prospects and one `SourceRun` so the smoke script and the UI
both have data.

Docs at implementation time: a dated Phase 8 section in `DECISIONS.md`
covering the extend-`Lead` decision and its kanban mitigation; the
`SourceRun`-not-`Organization.settings` watermark split;
`lib/jobs/orgs.ts` as the second documented `getDb()` exception;
`CRON_SECRET` now read, 404-not-401, 200-with-`ok:false`, and the
`/api`-in-`isProtectedRoute` warning; deterministic scoring with Claude
explaining only; the SDK-over-`fetch` deviation; MCP built-but-unwired
and HubSpot rejected on product grounds; dismissal via `DISQUALIFIED`
and dedupe deliberately ignoring `deletedAt`; Places content-caching
constraint; outreach drafted not sent; `after()` rejected. Plus
`README.md` project-layout entries for `lib/prospecting` and
`lib/jobs`.

---

## Implementation sequence

Branch `phase-8-prospecting` off `main`. One commit per completed unit;
every commit passes `typecheck && lint && test`.

1. Schema: enums, `Lead` columns, `SourceRun`, `TENANT_MODELS`, offline
   migration — **one commit**, then `pnpm prisma generate`
2. Kanban mitigation: `PROSPECT_STAGES`, the pipeline and dashboard
   filters, the guard test
3. `lib/prospecting/normalize.ts` + `dedupe.ts` + tests (pure, no DB)
4. `relevance.ts` + `gate.ts` + tests
5. `scoring.ts` + outreach templates + tests
6. `http.ts` retry helper
7. `sources/types.ts` + `sources/index.ts` + **openFDA connector** +
   parser test _(first source: free, keyless, nationwide — the easiest
   end-to-end proof)_
8. Google Places connector + parser test
9. Permit connector — **stub only**, inert until configured, per
   `TODO-FUTURE.md`'s existing wording
10. Enrichment interface + stub + Apollo provider
11. `ingest.ts` + `pipeline.ts` — first DB-touching commit
12. `lib/jobs/{cron,orgs,run}.ts` +
    `app/api/cron/prospecting/[source]/route.ts` + `vercel.json`
13. `lib/ai/` client + `runAiTask` + outreach drafting
14. `/prospects` page + `lib/actions/prospects.ts` + sidebar +
    `proxy.ts`
15. Settings form + `lib/db/org-settings.ts`
16. MCP source adapter + fixture test
17. `scripts/smoke-prospecting.ts`, `DECISIONS.md`, `TODO-FUTURE.md`,
    `README.md`

Then one PR for the phase.

## Verification (at implementation time)

`pnpm db:migrate` → `pnpm db:seed` → `pnpm exec tsx
scripts/smoke-prospecting.ts` prints `SMOKE OK` → `curl -H
"Authorization: Bearer $CRON_SECRET"
localhost:3000/api/cron/prospecting/fda` returns a run summary and
writes a `SourceRun` row → the same call with no header returns 404 →
running it twice creates zero duplicates → `/prospects` lists scored
prospects while `/pipeline` and `/dashboard` show none of them.
