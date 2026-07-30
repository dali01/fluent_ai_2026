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
