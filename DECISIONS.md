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
