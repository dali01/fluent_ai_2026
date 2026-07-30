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
- **Lead sourcing connectors** — ingestion interface + stub connector in
  Phase 8; real scraping of business registrations/permits is future work.
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
  ordering, AI quote chatbot (Phase 8).
