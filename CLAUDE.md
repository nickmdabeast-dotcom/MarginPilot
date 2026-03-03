# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Optimize for: small diffs, reliable behavior, and observable outputs.

## Hard Rules (never violate)

- Never claim you ran a command or verified behavior unless you actually did.
- Never invent env vars, secrets, URLs, or database contents.
- Do not broaden scope. If you find adjacent issues, list them under TODO (with severity) but do not implement.
- Do not refactor unrelated code "for cleanliness."
- Do not add new dependencies unless the task explicitly asks.

## Task Workflow

Default loop for any task:
1. Restate acceptance criteria as a checklist.
2. Identify exact files/lines to change (search first).
3. Implement the smallest change that satisfies acceptance.
4. Run verification commands (lint/test; build if relevant).

## Commands

```bash
npm install        # install dependencies
npm run dev        # start dev server at localhost:3000
npm run build      # production build
npm run lint       # ESLint via next lint
npm run test       # run all tests (Node.js built-in runner via tsx)
```

Run a single test file:
```bash
npx tsx --test tests/optimize.test.ts
npx tsx --test tests/csv.test.ts
```

## Environment Setup

Create `.env.local`:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

No service-role key is used — all access is session-based with RLS.

## Database Setup

Run migrations in order (Supabase SQL editor):
1. `supabase/migrations/0001_initial_schema.sql`
2. `supabase/migrations/0002_leads_dispatch.sql`
3. `supabase/migrations/0003_profiles_and_auth.sql`
4. `supabase/migrations/0004_rls.sql`

## Repo Invariants (must always hold)

### Multi-tenancy / company isolation
- Never trust a client-sent `company_id`. Scope is derived server-side via the existing auth utilities (`requireCompanyId()` in `lib/auth.ts`).
- All reads/writes must be scoped to the current company by the established pattern.
- Do not bypass RLS (service role) unless explicitly requested and documented.

### Auth boundaries
- Any route/action that mutates data must authenticate and authorize.
- Protected routes must remain protected.

### CSV import reliability (highest priority when broken)
- CSV pipeline must never fail with "0 valid rows" without returning diagnostics.
- Always return: detected headers (raw + normalized), row counts, per-row rejection reasons, and aggregated rejection counts.
- Header normalization must handle aliases and common variants (case/spacing/punctuation).

### Optimizer trustworthiness
- Optimizer must be deterministic for identical inputs unless explicitly changed.
- Any optimizer behavior change requires tests + before/after example + clear objective/constraints.

## Architecture Overview

**Stack:** Next.js 14 App Router + Supabase (Postgres + Auth) + Tailwind CSS + TypeScript

**Multi-tenancy model:** Every DB table has a `company_id` FK. RLS policies enforce company scoping at the DB level. The app layer uses `requireCompanyId()` from `lib/auth.ts` in all server actions and API routes.

### Auth Flow

- `middleware.ts` — intercepts every request, reads the custom `sb-session` cookie, calls `supabase.auth.setSession()` to validate/refresh, and enforces route protection.
- `lib/supabase/ssr.ts` — cookie extraction utilities and the custom session cookie name.
- `lib/supabase/server.ts` — creates a server-side Supabase client (reads cookies from `next/headers`).
- `lib/supabase/client.ts` — creates a browser-side Supabase client.
- `lib/auth.ts` — `getSessionUser()`, `getUserProfile()`, `requireCompanyId()` (throws `AuthError` when unauthenticated/unauthorized).
- On first login: `POST /api/auth/onboarding` calls the `ensure_user_profile()` DB function, which idempotently creates a `companies` row and a `profiles` row with `role = 'owner'`.

### Optimization Engine

The core business logic lives in `lib/optimize.ts` (pure TypeScript, no DB dependencies):

1. **Score** each job: `revenue * 0.5 + urgency * 0.3 - duration * 0.2`
2. **Sort** jobs by score descending
3. **Assign** jobs capacity-first to technicians: prefer techs who stay under 8h, otherwise pick the tech with the least projected hours
4. **Build** a dispatch plan: chain jobs sequentially starting at 08:00 (using a `1970-01-01` reference date that is re-dated by the API)
5. **Return** `{ baseline, optimized, delta, diagnostics, dispatch_plan }`

Called via the `runOptimization` Server Action (`actions/optimize.ts`) from the dispatch page, or via `POST /api/optimize`.

`lib/optimize.ts` exports `NORMALIZE_SCORING` (default `false`) — set to `true` to enable min-max normalization across job dimensions before scoring.

### API Routes (`app/api/`)

| Route | Purpose |
|---|---|
| `GET /api/dispatch?date=YYYY-MM-DD` | Fetch jobs for a date |
| `POST /api/dispatch/apply-optimization` | Persist optimized dispatch plan to `jobs` table |
| `POST /api/optimize` | Run optimizer and return results (does not persist) |
| `POST /api/jobs` | Create/import jobs |
| `GET/POST /api/leads` | Lead CRUD |
| `POST /api/auth/onboarding` | Ensure user profile exists after signup |
| `GET /api/health` | Health check (public) |

### Key Data Flow: CSV Import

`lib/csv.ts` — parses raw CSV text into `ParsedRow[]` (header-keyed objects).
`services/jobs.ts` — `validateJobRow()` validates and coerces each row (accepts flexible date/duration/urgency formats); `insertJobs()` upserts validated rows to the DB.

### Services

- `services/jobs.ts` — job validation, upsert, and `getJobsByDate()` (shapes DB rows into `JobInput[]` for the optimizer)
- `services/technicians.ts` — technician fetching and name→ID resolution

### Types

`types/index.ts` is a hand-maintained mirror of the Supabase-generated types. Update it when adding DB columns, or replace with `supabase gen types typescript` output.
