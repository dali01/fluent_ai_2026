# Architecture Decisions

Running log — newest last. Format: date, decision, why.

## 2026-07-30 — Phase 0

- **Next.js 16.2 (App Router) + React 19 + Tailwind v4** — latest stable at
  scaffold time via `create-next-app`. Auth interception lives in
  `proxy.ts` (Next 16's replacement for `middleware.ts`, Node runtime) —
  the old convention still works but emits a deprecation warning, and Clerk
  supports both.
- **Prisma 7 with the new `prisma-client` generator** — engine-less TS
  client generated into `lib/generated/prisma` (gitignored, rebuilt by the
  `postinstall`/`build` scripts). Runtime DB access uses
  `@prisma/adapter-neon` (Neon serverless driver — right fit for Vercel
  functions). CLI/migrations use `DIRECT_URL` (non-pooled) via
  `prisma.config.ts`.
- **Lazy Prisma singleton** (`lib/db/client.ts` → `getDb()`) — client is
  created on first use so `next build` succeeds with no `DATABASE_URL`.
  Application code must never import it directly once the tenant-scoped
  data-access layer lands (Phase 1).
- **Clerk Organizations = tenants.** Personal workspaces are hidden
  everywhere (`hidePersonal`); `requireOrg()` in `lib/auth` is the single
  guard for org-scoped pages/actions and redirects to `/select-org` when no
  org is active. `Organization.id` in Postgres is the Clerk org ID (no
  separate UUID to keep in sync).
- **Org guard lives in `app/(app)/layout.tsx`** — every route in the
  authenticated group is org-scoped by construction; pages call
  `requireOrg()` again only when they need the IDs.
- **Husky pre-commit = typecheck + lint + vitest.** Playwright is excluded
  from the hook (needs a running app + Clerk keys); it runs on demand and
  later in CI.
- **Direct commits to `main` for Phase 0** (nothing to preview against yet).
  PR-per-phase starts with Phase 1.
- **shadcn/ui v4 CLI with default preset** (base-nova, CSS variables).
  `components/ui` is excluded from Prettier to keep upstream diffs clean.

## 2026-07-30 — Phase 1

- **Tenant isolation = Prisma query extension, fail-closed.** All feature
  code uses `tenantDb(orgId)` (lib/db/tenant.ts); the pure rewrite logic
  lives in lib/db/tenant-scope.ts and is unit-tested exhaustively. Reads
  AND `{ organizationId }` into `where`; creates stamp it; updates/deletes
  extend the unique `where` with it (extended-where-unique); naming another
  org anywhere throws `TenantIsolationError`; unknown models/operations
  (incl. raw SQL) are rejected outright. `User`/`Organization` are global
  and refused by the tenant client.
- **Initial migration generated offline** via `prisma migrate diff
--from-empty` (no live DB needed); applied to Neon with
  `pnpm db:migrate` once DATABASE_URL exists. Same SQL either way.
- **Document numbers (jobNumber/quoteNumber/invoiceNumber) are Ints unique
  per org** (`@@unique([organizationId, n])`); allocation logic comes with
  the features that create them (Phases 3–4, 7).
- **Press double-booking**: Postgres exclusion constraints aren't
  expressible in Prisma, so overlap prevention is an app-level transaction
  check in the Phase 5 scheduling service; `ScheduleBlock` carries a
  `(pressId, startsAt, endsAt)` index for it.
- **Soft delete** (`deletedAt`) on user-removable business entities
  (Company, Contact, Lead, Job, Quote, InventoryItem, Press, Vendor,
  Invoice); ledger-like rows (StockMovement, Payment, ActivityLog) are
  immutable and never soft-deleted.
- **Money = Decimal(12,2)** (unitPrice 12,4 for sub-cent print pricing),
  quantities Decimal(12,3), dimensions in mm. One currency per org assumed
  for now (SEK default in seeds) — multi-currency is future work.
- **Seed goes through tenantDb()**, not the raw client, so seeding also
  smoke-tests the isolation layer. `SEED_ORG_ID`/`SEED_ORG_NAME` let us
  seed a real Clerk org instead of the demo one.

## 2026-07-30 — Phase 2

- **DB adapter picked by connection string**: localhost URLs use
  `@prisma/adapter-pg` (Docker Postgres for dev, container `fluent-pg`),
  everything else `@prisma/adapter-neon` (production). One env var, no
  config flag to forget.
- **Prisma CLI env loading matches Next.js**: `.env.local` then `.env`
  (prisma.config.ts + seed). The placeholder `.env` from prisma init was
  deleted.
- **Forms are server-action-first**: FormData → `parseForm` (Zod) →
  tenantDb, with `useActionState` for pending/error UI. No client-side
  form library; server validation is the source of truth.
- **Kanban drag-drop = @dnd-kit/core + useOptimistic**: card moves render
  instantly, server action persists, toast on failure. Column = droppable
  stage, card = draggable lead.
- **Archive, not delete**, everywhere in CRM UI (sets `deletedAt`; lists
  filter it out). Restore UI is future work.
- **scripts/smoke-crm.ts** replays every page query + live cross-tenant
  probes against the seeded DB — run it after schema changes.

## 2026-07-30 — Phase 2.5 (graphical profile)

- **Concept: "ink on paper."** Primary = deep indigo ink
  `oklch(0.42 0.15 268)`; surfaces are warm paper whites; dark mode is a
  blue-black pressroom tone. CMYK colors appear ONLY in the logo, chart
  series (`--chart-1..3` = cyan/magenta/yellow, 4 = ink, 5 = teal) and
  small landing accents — never as UI chrome.
- **Logo** (`components/brand/logo.tsx`): three overlapping CMYK dots with
  an ink center — a print registration mark. Favicon = `app/icon.svg`
  (same mark on ink background); default Next favicon removed.
- **Typography (revised in 2.5b):** Inter for UI/body, Schibsted Grotesk
  for headings (`--font-heading`, applied to h1–h4 globally), Geist Mono
  for numbers/code. Radius bumped to 0.75rem.
- **App shell (2.5b):** grouped sidebar nav (Sales / Production /
  Finance), content on `bg-muted/30` with a max-w-6xl column, sticky
  blurred header. Dashboard is data-driven: stat cards + pipeline-by-stage
  bars + recent activity.

## 2026-07-30 — Phase 3

- **Storage behind lib/storage `FileStorage`** — Vercel Blob when
  `BLOB_READ_WRITE_TOKEN` is set, local disk (`.uploads/`, served by an
  org-fenced `/api/files/[...key]` route) otherwise. Keys are always
  `orgId/jobId/vN-name`; the org prefix is part of tenant isolation.
  Blob uses public-but-unguessable URLs for now (private access on TODO).
- **Prepress = deterministic only** (lib/prepress): format allowlist
  (PDF/TIFF/PNG/JPEG), PDF trim-vs-spec (±1.5 mm, orientation-agnostic),
  bleed-box math, page-size consistency; raster effective-DPI at job size
  (300 pass / 150 warn floor) and CMYK-vs-RGB. Checks run synchronously in
  the upload action (fast, no queue needed). Claude explains results in
  Phase 8 — it never decides them.
- **Proof approvals are CSR-recorded until Phase 6** — the portal brings
  client self-serve approval + e-signature record; the model already
  supports it.
- **Job numbers**: max+1 per org at creation (#2001 seeds the sequence).
  Race window is acceptable at shop scale; unique constraint catches
  collisions.
- **Approve proof → job auto-moves to PREPRESS**; send proof → PROOFING.
  Other status moves are manual on the board.
- **Server-action body limit raised to 50 MB** (artwork uploads), file cap
  40 MB per upload.

## 2026-07-30 — Phase 4

- **Pricing engine is pure and shared** (lib/pricing): the quote builder
  imports the same computeQuote for live preview that the server action
  uses to persist, so preview and saved numbers can't diverge. Rules with
  invalid configs are skipped AND surfaced — never silently ignored.
- **Rule semantics:** first matching QUANTITY_TIER rule sets the unit
  price (manual override skips tiers); STOCK surcharges add per unit;
  FINISHING adds per-unit + flat; SETUP_FEE is quote-level;
  RUSH_FEE (% and/or flat) applies only when the quote is rush. Tier
  multiplier scales goods+rush; VAT (default 25%) applies after tier.
- **Quote lifecycle:** DRAFT→SENT→ACCEPTED→CONVERTED (+REJECTED/EXPIRED,
  EXPIRED can be re-SENT). Only drafts are editable. Accepted quotes can
  convert to a draft invoice (50% deposit default, 30-day due) and/or spawn
  a production job carrying the first line's specs.
- **Rule configs edited as JSON** in Settings with per-type examples and
  double validation (JSON parse + Zod per type). A friendlier form editor
  is future work.
- **Numbering series:** quotes #1001+, jobs #2001+, invoices #3001+.

## 2026-07-30 — Phase 5

- **Auto-deduct via planned JobMaterials:** stock is deducted when the
  job hits DONE, idempotently (existing JOB_CONSUMPTION movements per
  job+item are skipped). Stock MAY go negative on auto-deduct by design —
  the run already happened; the ledger reflects reality and the low-stock
  alert flags it. Manual adjustments, by contrast, refuse to go negative.
- **quantityOnHand is movement-driven** — item edits can't change it;
  only movements (opening stock counts as a PURCHASE movement).
- **Double-booking prevention = serializable transaction** around the
  overlap check + insert in createScheduleBlock. Conflicts report the
  clashing slot; serialization failures ask the user to retry.
- **Low-stock alerts are in-app** (banner + badges) for now; email/SMS
  notifications ride on the Phase 6 notification interface.
- **Schedule UI is a week grid** (presses × days), not a full calendar —
  revisit if shops need finer visualization.

## 2026-07-30 — Phase 6

- **Portal auth = bearer tokens per contact** (magic links), not a second
  Clerk surface. CSRs generate/rotate/revoke links from contact pages;
  resolvePortalToken is the only raw-client lookup (token → org), after
  which everything is tenantDb + explicit company fencing. Rate limiting
  lands in Phase 9.
- **E-signature record** on portal proof approval: typed full name + IP +
  user agent + ISO timestamp + SHA-256 hash, stored in
  Proof.signatureRecord and echoed to the activity log.
- **Email provider chosen by RESEND_API_KEY** (Resend REST, no SDK);
  console provider in dev. Notification sends never throw and are
  activity-logged. `EMAIL_FROM` configurable; SMS remains a logged stub.
- **Status/proof emails go to the company's oldest emailable contact** —
  a proper notification-preferences model is future work.
- **tsconfig excludes .next/dev** from standalone typecheck — the dev
  server races pre-commit tsc with partially-written generated types.
- **Known cosmetic**: Base UI logs a nativeButton warning for Buttons
  rendering <Link>/<a> via render prop — harmless, tracked in TODO.

## 2026-07-30 — Phase 7

- **Paid states are payment-driven only**: recording payments flips
  invoices to PARTIALLY_PAID/PAID from the paid-total; manual transitions
  cover SENT/OVERDUE/VOID. Overpayment is rejected.
- **Accounting sync behind lib/accounting** — invoice SENT pushes to the
  provider and stores externalSyncId; payments push when the invoice is
  synced. Stub provider today; QuickBooks/Xero swap in on env vars
  (TODO-FUTURE). Sync ids are visible on the invoice page.
- **Profitability = material margin** (invoice ex-VAT revenue, quote
  fallback; consumption × item unit cost). Incomplete costing is flagged
  rather than guessed. Labour costing is future work.

## 2026-07-30 — Phase 8 (prospecting; design in docs/prospecting.md)

- **Prospects extend `Lead`** (PROSPECT/DISQUALIFIED stages appended);
  the kanban mitigation is `PROSPECT_STAGES` siblings + stage filters on
  the pipeline/dashboard queries, guarded by a test. `moveLeadStage`
  already validates against `LEAD_STAGES`, so cards can't be dragged
  into PROSPECT.
- **Dismissal is `DISQUALIFIED`, not `deletedAt`** — and the dedupe
  index deliberately ignores `deletedAt`, or nightly runs would
  resurrect everything users rejected. A deliberate deviation from the
  archive convention.
- **`SourceRun` holds the per-source watermark** (advances only on
  success), run history and failure records; org _config_ stays in
  `Organization.settings.prospecting` via `lib/db/org-settings.ts`.
- **Two documented `getDb()` exceptions now exist:** portal-token lookup
  (Phase 6) and `lib/jobs/orgs.ts` + `lib/db/org-settings.ts` (cron has
  no Clerk session; Organization is refused by tenantDb).
- **`CRON_SECRET` is now read** (first time since Phase 0):
  constant-time compare, fails closed unset. Cron returns 404 (not 401)
  on a bad secret, and 200-with-`ok:false` on failed runs so Vercel
  Cron never retry-storms a bad upstream. **Warning: adding `"/api(.*)"`
  to `isProtectedRoute` in proxy.ts would silently break cron.**
- **Scoring is deterministic; Claude explains/drafts only** (per-trigger
  weight tables, injected clock, factors sum to score). Outreach is
  drafted and copied — never sent (no consent model; landing-page
  promise "reviewed by you, never auto-sent").
- **Anthropic SDK adopted** — deliberate deviation from the Resend
  no-SDK precedent: `messages.parse` + `zodOutputFormat` beat
  hand-rolled structured output. Opus 5: no sampling params, generous
  max_tokens (thinking included), `output_config.effort`, refusal check.
- **MCP source adapter is built but unwired**: HubSpot rejected on
  product grounds (Fluent AI _is_ the CRM), enrichment vendors' MCP
  servers are interactive-OAuth-only. Least-privilege toolset (default
  disabled + allowlist); every tool-result row is zod-validated — data,
  never instructions. Note: the MCP connector is unavailable on
  Bedrock/Vertex; this project calls the Anthropic API directly.
- **Places ToS made structural**: `place_id` is the durable key, cached
  content refreshable (purge job on TODO); permit config REQUIRES
  `termsUrl`. openFDA is public/unrestricted.
- **`after()` rejected** for fire-and-forget enrichment — not a queue
  (no retries, no visibility); jobs stay behind the documented interface.
- All colors flow through the shadcn/Tailwind v4 tokens in
  `app/globals.css` — no hardcoded hex in components (the logo/gradient
  use explicit oklch because SVG/inline-gradients can't read CSS vars in
  all contexts).

## 2026-07-30 — Phase 8b (AI insights, prepress explanations, portal chat)

- **Insight scores are deterministic; Claude explains, never decides**
  (same posture as prospecting): `lib/insights` computes reorder
  likelihood (ramp vs the customer's own median cadence) and churn risk
  (max of dormancy-vs-own-rhythm and 180-day volume decline) as pure
  functions with an injected clock, capped at 0.95 — never certainty.
  Claude's only role is the on-demand rep brief on `/insights`.
- **`LeadScore.enrichment` holds the factor breakdown** ({reorder,
  churn} JSON) — reusing the existing column rather than migrating; the
  deterministic one-liner lives in `rationale`. One upsert per company
  per run, keyed on the existing `[organizationId, companyId]` unique.
- **An order event = Job.createdAt** (the moment the customer bought),
  not DONE — status churn shouldn't move cadence math.
- **Insights cron at 05:00 UTC** with the Phase 8 posture (404 bad
  secret, 200 `{ok:false}` on failure); the `/insights` Recompute
  button calls the same function.
- **Prepress explanations are ephemeral**: shown + copy-to-clipboard,
  logged on AiTask, but not persisted to the JobFile — the deterministic
  checks remain the record; explanations regenerate on demand.
- **Portal chatbot is read-only by construction**: the API route
  assembles a company-scoped snapshot (open quotes+lines, jobs, open
  invoices) from the portal token's context and Claude answers ONLY
  from it — no negotiation, no actions, prices quoted as-is, injection
  attempts declined by system prompt. 404 on bad token (matching the
  files route), zod caps history at 20×2000 chars. Chat is plain-text
  (`messages.create`), not structured output — it's conversation.
- Per-message chat persistence rejected for now: turns live in the
  browser; AiTask logs each call with cost. Rate limiting rides the
  existing "portal rate limiting" TODO (Phase 9).

## 2026-07-30 — Per-org settings, auth redirect, demo data

- **Currency is a per-org display setting**, not a data column:
  `Organization.settings.general.currency` (zod, SEK default) rendered
  through the single `formatMoney()` helper. Switching it relabels
  existing amounts — it does NOT convert them. Real multi-currency needs
  per-record currency on Quote/Invoice (TODO-FUTURE).
- **Currency constants live in `lib/format/money.ts`, never `lib/db`** —
  client components importing them from `lib/db/org-settings` pulled the
  Prisma pg adapter into the browser bundle (`Module not found: 'dns'`).
  Rule: anything a `"use client"` file imports must not transitively
  reach `lib/db`.
- **Sign-in redirect is explicit in code**, not env-dependent: prod has
  no `NEXT_PUBLIC_CLERK_*_REDIRECT_URL` vars, so Clerk's default dropped
  authenticated users back on the marketing page ("login does nothing").
  `fallbackRedirectUrl="/dashboard"` on SignIn/SignUp plus a server-side
  bounce off `/` for signed-in users.
- **Demo data is market-parameterized** (`SEED_MARKET=se|us`): Swedish
  dataset (Jönköping, SEK, 25% VAT) vs US (Austin, USD, 8.25% sales
  tax), each with its own companies, contacts, job titles, vendors,
  prospect and prospecting config. Identical seeds across orgs read as a
  tenant leak during demos even when isolation is correct — distinct
  data per org is a demo requirement, not a cosmetic one.
- **`scripts/reset-org.ts`** deletes an org's tenant rows in FK order
  (org row + memberships kept) so a demo org can be re-seeded for a
  different market.
- **Reorder likelihood tapers past 2.5× cadence** (0 by 5×): a customer
  silent for a year is churned, not "due". Without the taper, dead
  accounts topped the reorder list.

## 2026-07-30 — Per-org discovery agents

- **Which agents an org runs is org config, not deployment config**:
  `Organization.settings.prospecting.sources` ({fda, places, permit}).
  It is deliberately separate from the master `enabled` switch — that
  turns prospecting off entirely; these pick the agents. `permit`
  defaults **off** because its connector is still a stub.
- **Three named gates, each with a reason**: org switch → agent toggle →
  connector readiness. Precedence is that order, so the message a user
  sees names the thing _they_ can fix first.
- **`unavailableReason()` joins the connector interface.** `isConfigured()`
  alone could only say no, which produced the worst possible UX: a
  manual "Run" that reported success while doing nothing, because an
  unconfigured source returns `SKIPPED` with `ok: true` (correct for
  cron, misleading for a human). Reasons name the exact env var or
  setting, are asserted never to disagree with `isConfigured()`, and are
  persisted on the `SourceRun` row.
- **`runProspectSourceNow` returns the outcome, not a boolean** — status
  plus counts, or the skip reason. Skips toast as warnings, successes
  report `fetched/created/duplicates/screenedOut`.
- **Source identities live in a pure `sources/meta.ts`** so the settings
  form can render the agent list client-side; `sources/index.ts` (which
  constructs connectors and pulls in fetch plumbing) re-exports it. Same
  rule as `lib/format` vs `lib/db`.

## 2026-07-31 — Free discovery agents

- **The registry is now one exhaustive table.** `SOURCE_META` carries a
  source's enum value, dedupe mode, relevance screen, badge class and
  outreach angle, so adding an agent is a compile error until it is
  fully wired. This replaced five parallel lookups that each failed
  _silently_: `SOURCE_TO_ENUM`'s `?? "MANUAL"` fallback (wrong weights
  and dedupe bucket), a hand-written enum union (runtime Prisma error
  before the try/catch, recorded nowhere), relevance defaulting to the
  local screen (100% screened out, run still reports SUCCEEDED), and
  `Record<string, string>` maps for badges and outreach angles.
  `tests/unit/prospecting-registry.test.ts` asserts every one.
- **OpenStreetMap replaces the paid dependency for local discovery.**
  Overpass is keyless; the licence cost is attribution, not money, so
  "© OpenStreetMap contributors" renders on `/prospects` whenever an
  OSM row is shown. `(newer:"<cursor>")` makes it a genuine trigger
  source rather than a coverage sweep, and `version === 1` distinguishes
  a newly mapped business from an old one someone just corrected.
  Category selectors are validated against `key=value` before being
  interpolated into Overpass QL — config is not a query language.
- **`isRelevantOsm` deliberately accepts coordinates instead of an
  address.** OSM POIs routinely lack `addr:*` tags, and the local
  screen's hard address requirement would reject most of the map. The
  OSM node id is a stable `externalId`, so dedupe holds regardless.
- **The permit connector is config-driven, not city-specific.** One
  adapter speaks Socrata and ArcGIS; a new city is a `permitSource`
  block (feed URL, field mapping, **required** `termsUrl`). The first
  live run failed loudly on guessed column names — which is the
  designed behaviour, and why city/postcode fields are configurable now
  rather than hardcoded.
- **Feed timestamps are read as UTC.** Open-data portals publish civil
  times with no zone, so `new Date()` read them as local: the same feed
  produced different trigger dates on a UTC+2 laptop and on Vercel,
  shifting recency scores and the watermark by a day.
- **Windowing rules learned live:** a first run defaults to 30 days
  (ordering ASC from the beginning of time returned 1980s permits), and
  the cursor re-polls one day of overlap because `>` on a date-only
  column silently skips records added later that same day.
- **`proximity` weights are zero everywhere.** `ingest.ts` never passes
  a proximity value, so Places' old 0.20 weight was unreachable points
  that silently capped every Places score at 80.
- **Sources considered and NOT built**, with reasons, so they are not
  re-litigated: **Bolagsverket** — its free API is an org-number lookup,
  so it cannot enumerate new companies and cannot drive discovery (also
  OAuth2 credentials by post, docs behind a CAPTCHA); **Federal
  Register** — labelling rules name industries, not companies, so it
  belongs in a compliance/upsell surface against existing customers
  rather than the prospect model; **USPTO trademarks** — needs a free
  registered key and its Open Data Portal contract could not be verified
  after the June 2026 Developer Hub decommission.
