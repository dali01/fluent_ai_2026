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
