# Fluent AI

A modern, multi-tenant SaaS CRM for print businesses — from small shops to
printing plants. Client acquisition, quoting, production, inventory,
scheduling and invoicing in one workspace, with AI woven through the
workflows that matter (prepress checks, lead scoring, outreach drafts,
forecasting).

## Stack

- **Next.js** (App Router, TypeScript, full-stack — no separate API server)
- **Neon** serverless Postgres via **Prisma** (driver adapter: `@prisma/adapter-neon`)
- **Clerk** authentication — Clerk **Organizations** model tenants (1 org = 1 print business)
- **Anthropic Claude** for AI features, server-side only
- **Vercel** hosting (GitHub integration: `main` → production, PRs → previews), **Vercel Blob** file storage, **Vercel Cron** background jobs
- **Tailwind CSS v4 + shadcn/ui**, Lucide icons
- **Zod** validation, **Vitest** unit tests, **Playwright** E2E
- **pnpm** package manager

## Getting started

```bash
corepack enable pnpm   # once, if pnpm is not installed
pnpm install           # also runs `prisma generate` (postinstall)
cp .env.example .env.local
# Fill in .env.local — Clerk keys are required to run the app;
# Neon URLs are required from Phase 1 onward.
pnpm dev
```

Open http://localhost:3000 — public landing page. Sign in to reach the
org-scoped dashboard at `/dashboard`. Users without an active organization
are sent to `/select-org` to pick or create their print business.

### Clerk setup

1. Create an application at https://dashboard.clerk.com
2. **Enable Organizations** (Configure → Organization Settings)
3. Copy the publishable + secret keys into `.env.local`

### Neon setup (needed from Phase 1)

1. Create a project at https://neon.tech
2. Copy the **pooled** connection string into `DATABASE_URL` and the
   **direct** connection string into `DIRECT_URL`
3. `pnpm prisma migrate dev`

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

## Deploy (Vercel)

The GitHub repo is connected to a Vercel project: pushing `main` deploys
production; every PR gets a preview deploy. Set these env vars in Vercel
(Project → Settings → Environment Variables): everything in
[.env.example](.env.example) except the Clerk URL vars (those have safe
defaults committed here, but setting them does no harm).

## Project layout

```
app/(marketing)   public landing
app/(auth)        Clerk sign-in / sign-up / org picker
app/(app)         authenticated, org-scoped dashboard
app/api           route handlers (webhooks, cron, AI) — from Phase 2+
lib/db            Prisma client + tenant-scoped data access (Phase 1)
lib/auth          Clerk helpers (requireOrg)
lib/ai            Claude wrapper (Phase 8)
prisma/           schema + migrations
tests/unit        Vitest
tests/e2e         Playwright
```

See [DECISIONS.md](DECISIONS.md) for architecture decisions and
[TODO-FUTURE.md](TODO-FUTURE.md) for deferred items.
