# Deferred / Future Work

- **Queue migration** — background jobs start on Vercel Cron behind a job
  interface (`lib/jobs`, Phase 8); move to Inngest/Trigger.dev when volume
  demands it.
- **S3 storage swap** — Vercel Blob sits behind a small storage interface
  (Phase 3); S3 becomes a drop-in implementation.
- **QuickBooks/Xero OAuth** — Phase 7 ships interface + stub only; real
  OAuth flows later.
- **SMS provider (Twilio)** — Phase 6 wires email (Resend) first; SMS stays
  behind the notification interface as a stub.
- **Lead sourcing / prospecting** — full design in
  [docs/prospecting.md](docs/prospecting.md) (Phase 8). Deferred beyond
  that design:

  | Deferred                                                     | Why                                                                                                                               |
  | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
  | Real permit/licence parser                                   | Pilot source URL/format supplied later; guessing now is guaranteed rework. Interface + stub ships.                                |
  | HubSpot sync — recommend dropping entirely                   | Fluent AI _is_ the CRM. Not a phase-ordering deferral, a product rejection.                                                       |
  | MCP-native enrichment                                        | Vendor MCP servers are interactive-OAuth-only; unattended cron has no consenting user. Drop-in when static-token auth appears.    |
  | Cold-outreach sending + consent/suppression tracking         | CAN-SPAM/GDPR surface with no consent model in the schema. Drafts only.                                                           |
  | Fuzzy matching (`pg_trgm`) + denormalized `Company.nameKey`  | Suffix stripping plus token-set equality covers realistic variance; a column on a live table plus a backfill isn't justified yet. |
  | Places raw-payload purge job                                 | Enforces the content-caching window structurally.                                                                                 |
  | Prospect detail route, pagination, saved views, bulk qualify | One page with collapsible rows and `take: 100` is the minimum useful surface.                                                     |
  | Per-org prospecting config UI beyond the market form         | Cadence and per-source toggles can wait for a second market.                                                                      |
  | Geocoding for the proximity score factor                     | Needs a geocoding provider; the factor is weight-zero until then.                                                                 |
  | Consolidating the Resend call onto `http.ts`                 | Real cleanup, wrong PR.                                                                                                           |

- **Real multi-currency** — currency is a per-org display setting today
  (`Organization.settings.general.currency`); amounts are never
  converted. True multi-currency needs a currency column on
  Quote/Invoice/Payment plus rate handling at capture time.
- **Clerk production instance** — running on dev-instance keys until a
  custom domain exists.
- **Clerk webhook → Organization sync** — mirror org create/update/delete
  into the `Organization` table (needed by Phase 1/2; add webhook handler +
  `CLERK_WEBHOOK_SIGNING_SECRET` env var).
- **CI pipeline** — GitHub Actions running typecheck/lint/test/e2e on PRs
  (Phase 9 hardening; Vercel preview builds cover deployability until then).
- **Playwright in CI** — needs Clerk test-mode keys and a seeded test org.
- **Tenant-layer integration tests against a real Postgres** — the rewrite
  logic is fully unit-tested; once Neon (or a local Postgres in CI) exists,
  add integration tests exercising tenantDb() end-to-end.
- **Nested-write connect validation** — top-level ops are org-fenced; add
  defense-in-depth validation of nested `connect`/`connectOrCreate` IDs
  (they can't move rows across orgs, but a malicious relation connect to
  another org's parent row should throw rather than rely on FK+where).
- **Per-org number sequences** — allocation helper for jobNumber /
  quoteNumber / invoiceNumber (transactional, gap-tolerant).
- **Portal rate limiting + token expiry** — bearer tokens currently live
  until rotated; add expiry, per-IP throttling (Phase 9 hardening).
- **Notification preferences** — who gets which emails per company;
  currently the oldest emailable contact receives everything.
- **Base UI nativeButton warning** — Buttons rendering <Link> via render
  prop log an a11y warning in dev; audit and set nativeButton={false}
  where appropriate.
- **Portal storefront v2** — quantity/spec tweaks on reorder, new-product
  ordering (the AI quote chatbot shipped in Phase 8b).
- **Remaining AiTask kinds** — BATCHING_SUGGESTION, TURNAROUND_ESTIMATE,
  WASTE_ESTIMATE, DEMAND_FORECAST are reserved in the enum but unbuilt;
  each needs a deterministic base (like lib/insights) before Claude gets
  to explain anything.
- **Portal chat persistence** — turns are browser-local today (AiTask
  logs each call); persist threads if shops want to review conversations.
