# Fluent AI

A multi-tenant SaaS CRM for print businesses — from small shops to printing
plants. Client acquisition, quoting, production, inventory, scheduling and
invoicing in one workspace, with AI doing the work a print shop actually
can't: finding new customers before competitors do, catching artwork
problems before they hit the press, and telling a rep who to call today.

---

## The AI edge

Most "AI CRMs" bolt a chatbot onto a contact list. Fluent AI's AI does
seven specific jobs, each grounded in one architectural rule:

> **Deterministic-first: the machine decides with code, Claude explains
> in words.** Every score, verdict and price comes from pure, unit-tested
> functions with an injected clock. Claude never invents a number, never
> negotiates, and never sends anything on its own. That makes the AI
> auditable, testable and cheap — and means a model change can't silently
> alter your pipeline.

### 1. Autonomous prospecting — leads that arrive while you sleep

Fluent AI watches public signals for businesses that are about to need
print, then does the qualifying work before a human looks:

| Source                             | Signal                                           | Why a printer cares                                                                       |
| ---------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| **OpenStreetMap** (free, no key)   | Businesses newly mapped near you                 | Local discovery with no API bill — the keyless answer to "who's nearby I've never quoted" |
| **openFDA drugs** (free, no key)   | A drug application clears approval               | Cartons, package inserts, blister foil and pharmacy labels — procurement starts in weeks  |
| **openFDA devices** (free, no key) | A 510(k) medical device is cleared               | Instructions-for-use booklets, cartons, sterile-barrier labels — compliance-grade work    |
| **Permit / licence feeds** (free)  | A permit is issued in your city                  | Signage, cards, menus, window graphics — needed immediately                               |
| **Google Places** (paid key)       | Established local businesses you've never quoted | Optional: broader coverage than OSM where the budget exists                               |

**Four of the five need no API key at all.** Places is the only paid
source, and OpenStreetMap covers the same ground for free; the permit
adapter speaks both Socrata and ArcGIS, so adding a city is a
configuration block, not code.

Each discovered lead runs a deterministic gauntlet before it costs you
anything:

- **Relevance screening, fail-closed** — a bulk pharmaceutical ingredient
  never becomes a "packaging lead", and competing print shops are
  denylisted. Unknown categories are rejected, not guessed.
- **Deduplication** — place-and-address identity for local sources,
  sponsor-name identity for FDA, with token-set name normalization
  (legal-suffix stripping, diacritics, `&`→`and`). Existing customers are
  recognised and become **upsell signals** instead of duplicates.
- **Deterministic scoring** — per-trigger weight tables with exponential
  recency decay (a 30-day half-life for permits, 45 for FDA), so factors
  visibly sum to the score. Every prospect row shows its own breakdown.
- **A spend gate** — enrichment (contact lookup) only fires above a score
  threshold and under a per-run cap, so you never pay to enrich noise.
- **Idempotency you can prove** — a unique `(org, source, externalId)`
  index plus watermarks that advance _only_ on success. Re-running a
  source creates zero duplicates; the smoke test asserts it.

**Claude's one job here:** turning the trigger into outreach copy that
references the actual event ("your ANDA just cleared") rather than a
generic pitch. Drafts are shown and copied — **never auto-sent**, because
there's no consent model in the schema and cold email is a legal surface,
not a feature.

Runs unattended on Vercel Cron, per-org isolated, behind constant-time
secret auth. Dismissing a prospect suppresses it from every future run.

### 2. Quoting from a customer's own words

Turning "need ~2.5k A5 flyers, decent paper, folded, by the 14th" into a
priced quote is typing, not judgement — and it is the biggest daily time
sink in a print shop. Paste the enquiry on `/quotes` and Claude extracts
the spec; the **deterministic pricing engine** prices it; a human
confirms before anything is saved.

Claude does the one thing it is genuinely better at than code —
unstructured to structured — and touches no money. Every value it
inferred is listed as an assumption ("read 'ca 2,5k' as 2500"), and
genuine unknowns become questions for the customer rather than plausible
defaults. A deterministic guard rejects prose in the date field: a real
test enquiry said "by the 14th", which becomes a clarification, not a
`dueDate`.

### 3. Customer insights — who to call today

`/insights` ranks your existing customers on two deterministic signals:

- **Reorder likelihood** — measured against each customer's _own_ median
  cadence, not a global rule. A monthly menu customer 50 days silent is
  due; an annual report client isn't. Past 2.5× their cadence the score
  tapers away, because a customer silent for a year isn't "due" — they've
  churned, and the churn signal owns them.
- **Churn risk** — the worse of dormancy-against-own-rhythm and order
  volume decline between consecutive 180-day windows.

Neither ever reaches certainty (capped at 0.95); the future isn't a
database column. **Claude's job:** on demand, turn the factors into a rep
brief — what the numbers mean for _this_ customer, a concrete next step,
and an opener grounded in their real order history.

Alongside them, a **compliance radar**: final labelling and packaging
rules from the Federal Register, matched against your existing customers
by industry, so a regulation with an effective date becomes a reprint
conversation before your competitor has one. It matches one industry at
a time and tells you which industry caught each customer — matching
loosely is how a restaurant ends up flagged for a medical-device rule.

### 4. Production intelligence — the print-native part

Five measurements a generic CRM cannot make, all computed from the
shop's own figures and all willing to say "not enough data":

- **Turnaround promises.** Earliest feasible finish from press
  throughput, makeready and existing bookings — stepping over
  commitments with the same overlap rule the scheduler enforces, so an
  estimate can never promise a slot the booking check would reject. No
  run speed recorded? It returns nothing rather than a date a shop would
  repeat to a customer.
- **Bottleneck analytics.** Median dwell per stage, the slowest stage,
  end-to-end time and on-time rate, from a structured record of every
  status transition. Stages below three completed visits report nothing;
  jobs currently sitting in a stage count as _open_ rather than dragging
  the median down; on-time excludes jobs that never had a promised date.
- **Paper to order.** Makeready plus run spoilage from the press's
  configured figures — labelled **estimated**, always. A separate
  measurement only counts jobs where somebody recorded real usage, and
  only above five samples, then reports the drift against what the press
  is configured for. Recording actuals is optional and never blocks
  finishing a job.
- **Batching opportunities.** Jobs sharing stock, colour mode and finish
  that could run as one setup, with the makeready saved. Deliberately
  conservative: it consolidates _setup_, it does **not** nest different
  jobs onto a shared sheet, and it says so — real imposition depends on
  grain, gripper and bleed the schema doesn't model, and a suggestion
  that wastes stock destroys trust the first time it's wrong.
- **Demand forecasting.** Per-material consumption projected from your
  own ledger: a monthly average, a quarter-over-quarter trend, and a
  seasonal index only once twelve complete months exist. The current
  partial month is excluded, because a half-finished month reads as
  demand collapsing. It reports **days of cover** and states outright
  that supplier lead time is unknown — it tells you how long stock
  lasts, never when to order.

### 5. Prepress that speaks human

Artwork checks are pure, deterministic file inspection — trim size against
job spec (orientation-agnostic, with cutting tolerance), bleed box
geometry, effective DPI at physical size, colour space, page-size
consistency, and parse failures (corrupt or password-protected files).
The verdict is never AI-generated.

**Claude's job:** translate the results into an email-ready message a
customer with no print background can act on, plus per-problem fix steps
in their design tool. "Your trim box is 216×303 mm but the job is
210×297 mm" becomes something you can actually send. Copy-to-clipboard,
reviewed by you.

### 6. A client portal that answers its own questions

Customers get a tokenised portal — live job status, e-signature proof
approval (with IP, user-agent and SHA-256 signature hash), artwork upload
that runs prepress checks on arrival, and one-click reorder.

The portal chatbot answers from a **company-scoped snapshot** assembled
server-side from the bearer token: their open quotes with line items,
their jobs, their unpaid invoices. It is read-only by construction — it
cannot discount, reschedule, promise, or change an order, it quotes
prices as-is, and prompt-injection attempts are declined. Cross-customer
and cross-tenant data are structurally unreachable, not filtered out.

Turning a conversation into business stays an explicit customer act:
**"Request a quote for this"** extracts a spec from what they already
wrote and files it as a lead for a human to price. The chatbot never
decides that someone is ready to buy, and the lead is created even when
extraction fails — a customer asking for a quote must not be dropped
because a model call was.

### 7. A weekly briefing that leads with what's wrong

A countable KPI pack — pipeline by stage, jobs due and overdue, unpaid
invoices, proofs waiting, low stock, reorder and churn names, on-time
rate — assembled by a pure function and narrated by Claude, emailed to
the org's admins on a Monday. It opens with money at risk, not a data
dump. Every figure is supplied; the model prioritises and phrases, it
does not compute.

### Cost accounting, built in

Every Claude call runs through `runAiTask`, which drives an `AiTask` row
from `RUNNING` to `SUCCEEDED`/`FAILED` and records model, token counts
and computed cost in cents. Settings shows the spend per feature over
the last 30 days, so the cost of every AI surface is legible rather than
invisible.

---

## The rest of the product

**Sales** — companies and contacts with tags and reseller price tiers, a
communication log, and a drag-and-drop pipeline kanban. Sourced prospects
are deliberately fenced off the board until qualified.

**Quoting** — a rules-based pricing engine (quantity breaks, stock
surcharges, finishing, rush fees, setup fees, tier multipliers) with a
live builder preview and a full breakdown stored on the quote. Quotes
convert to jobs and invoices.

**Production** — print-native job specs (stock, size in mm, colour mode,
bleed, trim, finishing, binding), a status board from design through
shipping, versioned artwork files with prepress results, and a proofing
loop.

**Operations** — inventory with a stock-movement ledger and low-stock
warnings, automatic material deduction on job completion, and press
scheduling that prevents double-booking under a serializable transaction.
Plus vendors for outsourced finishing.

**Finance** — invoices with deposits, payment-driven status transitions
(never set by hand; overpayment rejected), per-job material-margin
profitability, and an accounting-sync interface (stub today, QuickBooks/
Xero drop-in later).

**Notifications** — transactional email (proof requests, status changes)
behind a provider interface: Resend when configured, console-logged
otherwise, so the flow is testable without sending anything. SMS is a
documented stub.

**Per-org settings** — currency (display), pricing tiers and rules, and
prospecting market configuration, all scoped to the organization.

### Tenant isolation is the foundation

Every tenant table carries `organizationId`, and all access goes through
`tenantDb(orgId)` — a Prisma extension that rewrites queries **fail-closed**:
reads are AND-fenced, creates are stamped, updates and deletes use
extended unique-where clauses, and any unknown model or operation throws
rather than passing through unscoped. Three raw-client exceptions exist
and are documented in [DECISIONS.md](DECISIONS.md). Unit tests plus live
cross-tenant probes in the smoke scripts prove a foreign org sees zero
rows.

---

## Stack

- **Next.js** (App Router, TypeScript, full-stack — no separate API server)
- **Neon** serverless Postgres via **Prisma** (driver adapters: Neon in prod, node-postgres for localhost)
- **Clerk** authentication — Clerk **Organizations** model tenants (1 org = 1 print business)
- **Anthropic Claude** (Opus 5) for AI features, server-side only — keys never reach the browser
- **Vercel** hosting (`main` → production, PRs → previews), **Vercel Blob** storage behind a swappable interface, **Vercel Cron** behind a queue-ready job interface
- **Tailwind CSS v4 + shadcn/ui** (Base UI primitives), Lucide icons
- **Zod** validation, **Vitest** unit tests, **Playwright** E2E
- **pnpm** package manager

## Getting started

```bash
corepack enable pnpm   # once, if pnpm is not installed
pnpm install           # also runs `prisma generate` (postinstall)
cp .env.example .env.local
# Clerk keys + a database URL are required to run the app.
pnpm dev
```

Open http://localhost:3000 — public landing page. Sign in to reach the
org-scoped dashboard at `/dashboard`. Users without an active organization
are sent to `/select-org` to pick or create their print business.

### What each key unlocks

`ANTHROPIC_API_KEY` is **required for every AI feature** — outreach
drafting, insight explanations, prepress translations and the portal
chatbot all call Claude server-side. Without it the app still builds and
runs, and the whole CRM works; the AI actions just report "AI is not
configured" and the portal chat card doesn't render.

The deterministic half needs no AI key at all: prospecting still
discovers, screens, dedupes and scores leads, and `/insights` still
computes reorder and churn. Only the _explaining_ stops — which is the
deterministic-first rule showing up as an operational property.

| Key                     | Without it                                            |
| ----------------------- | ----------------------------------------------------- |
| `ANTHROPIC_API_KEY`     | All AI features off; everything else works            |
| `CRON_SECRET`           | Scheduled jobs fail closed (404) — set it in Vercel   |
| `GOOGLE_PLACES_API_KEY` | Places source reports `SKIPPED`; openFDA needs no key |
| `APOLLO_API_KEY`        | Enrichment falls back to a deterministic stub         |
| `RESEND_API_KEY`        | Emails are console-logged instead of sent             |
| `BLOB_READ_WRITE_TOKEN` | Uploads go to a local `.uploads` directory            |

### Clerk setup

1. Create an application at https://dashboard.clerk.com
2. **Enable Organizations** (Configure → Organization Settings)
3. Copy the publishable + secret keys into `.env.local`

### Database

**Local dev** (no Neon needed): run Postgres in Docker and point
`DATABASE_URL`/`DIRECT_URL` at it — localhost URLs automatically use the
node-postgres driver instead of the Neon serverless driver.

```bash
docker run -d --name fluent-pg -e POSTGRES_PASSWORD=fluent -e POSTGRES_DB=fluent -p 5432:5432 postgres:17
```

```
DATABASE_URL=postgresql://postgres:fluent@localhost:5432/fluent
DIRECT_URL=postgresql://postgres:fluent@localhost:5432/fluent
```

Then `pnpm db:migrate && pnpm db:seed`.

**Production (Neon)**:

1. Create a project at https://neon.tech
2. Copy the **pooled** connection string into `DATABASE_URL` and the
   **direct** connection string into `DIRECT_URL`
3. `pnpm db:migrate && pnpm db:seed`

### Demo data

```bash
SEED_ORG_ID=<clerk-org-id> SEED_MARKET=se pnpm exec tsx scripts/seed-demo.ts
```

Seeds a market-specific dataset — `se` (Swedish customers, SEK, 25% VAT,
Jönköping prospecting) or `us` (US customers, USD, 8.25% sales tax,
Austin prospecting) — with 8 companies whose order histories are
deliberately time-shaped so `/insights` has a real story: one customer
due to reorder, one churned, one declining, one healthy. Includes jobs
across every production stage, kanban leads in every column, quotes and
invoices in every state, low stock, press schedules, prospects and a
portal link.

- `scripts/reset-org.ts <orgId>` — clear one org's tenant data first
  (keeps the org row and memberships)
- `scripts/grant-org-access.ts <email>` — make a user admin of every
  Clerk org

## Scripts

| Script           | What it does                                                                       |
| ---------------- | ---------------------------------------------------------------------------------- |
| `pnpm dev`       | Dev server                                                                         |
| `pnpm build`     | `prisma generate` + production build                                               |
| `pnpm typecheck` | `tsc --noEmit`                                                                     |
| `pnpm lint`      | ESLint                                                                             |
| `pnpm test`      | Vitest unit/integration tests                                                      |
| `pnpm test:e2e`  | Playwright E2E (needs `.env.local` + `pnpm exec playwright install chromium` once) |
| `pnpm format`    | Prettier write                                                                     |

A Husky pre-commit hook runs `typecheck && lint && test`.

**Smoke scripts** run the real data-access layer against a live database
and assert behaviour end-to-end, including cross-tenant probes:
`scripts/smoke-{crm,jobs,quotes,inventory,financials,prospecting,insights}.ts`.
`smoke-prospecting.ts` is the dedupe proof — it ingests the same batch
twice and asserts zero duplicate rows.

## Deploy (Vercel)

The GitHub repo is connected to a Vercel project: pushing `main` deploys
production; every PR gets a preview deploy. Set the env vars from
[.env.example](.env.example) in Project → Settings → Environment
Variables. `CRON_SECRET` is required for the scheduled jobs to run at all
(cron requests fail closed and return 404 without it).

Scheduled jobs ([vercel.json](vercel.json)): FDA prospecting nightly,
permits nightly, Places weekly, insights recompute nightly — staggered,
each per-org isolated so one tenant's failure can't abort another's.

## Project layout

```
app/(marketing)   public landing
app/(auth)        Clerk sign-in / sign-up / org picker
app/(app)         authenticated, org-scoped app
app/(portal)      tokenised client portal
app/api           route handlers (files, cron, portal chat)
lib/db            Prisma client + fail-closed tenant-scoped data access
lib/auth          Clerk helpers (requireOrg)
lib/ai            Claude client, AiTask cost runner, outreach/insights/
                  prepress/chat/RFQ extraction/briefing, spend reporting
lib/insights      deterministic reorder + churn scoring, demand
                  forecasting, weekly KPI pack
lib/compliance    Federal Register rules matched to customer industries
lib/production    turnaround, cycle time, waste, batching — all pure
lib/prospecting   lead sourcing: connectors, dedupe, relevance, scoring, pipeline
lib/prepress      deterministic artwork checks
lib/pricing       pure pricing engine
lib/jobs          cron auth, org fan-out
lib/storage       Blob or local filesystem behind one interface
lib/notifications email provider interface (Resend or console), SMS stub
lib/portal        portal token resolution → tenant context
prisma/           schema + migrations
tests/unit        Vitest
tests/e2e         Playwright
```

See [DECISIONS.md](DECISIONS.md) for architecture decisions,
[docs/prospecting.md](docs/prospecting.md) for the prospecting design
contract, and [TODO-FUTURE.md](TODO-FUTURE.md) for deferred items.
