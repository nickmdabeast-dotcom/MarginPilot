# HVAC Revenue OS / MarginPilot

Next.js (App Router) + Supabase app for revenue optimization, dispatch, and lead workflows.

## Requirements

- Node.js 18+
- Supabase project

## Environment Variables

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Notes:

- Do not expose or commit service-role keys.
- This app is configured to run user-scoped queries with RLS, not service-role bypasses.

## Database Setup

Run migrations in order (Supabase SQL editor or your migration runner):

1. `supabase/migrations/0001_initial_schema.sql`
2. `supabase/migrations/0002_leads_dispatch.sql`
3. `supabase/migrations/0003_profiles_rls.sql`

`0003_profiles_rls.sql` adds:

- `profiles` table (`user_id -> company_id`, role, timestamps)
- onboarding helpers (`ensure_user_profile`, trigger on `auth.users`)
- RLS + company-scoped policies for:
  - `companies`
  - `profiles`
  - `technicians`
  - `jobs`
  - `optimization_runs`
  - `customers`
  - `leads`
  - optional policies for `messages` / `conversations` / `appointments` if those tables exist

## Install and Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Auth and Onboarding Flow

- Public pages:
  - `/`
  - `/login`
  - `/signup`
- Protected app pages:
  - `/dashboard`
  - `/dispatch`
  - `/leads`
  - `/jobs`
  - `/customers`
  - `/reports`
- Protected API routes:
  - all `/api/*` except `/api/health` and `/api/auth/*`

On first signup/login:

- `POST /api/auth/onboarding` runs `ensure_user_profile(...)`
- if profile does not exist, it creates:
  - one `companies` row
  - one `profiles` row with `role = 'owner'`
- flow is idempotent and safe to retry

## How To Test

### 1) Signup/Login + Route Protection

1. Visit `/signup` and create an account.
2. Confirm redirect or confirmation prompt depending on your Supabase email-confirmation setting.
3. Visit `/dashboard` and `/dispatch` while logged in.
4. Sign out and revisit `/dashboard`; you should be redirected to `/login`.

### 2) API Auth Enforcement

Logged out request to protected API should return 401:

```bash
curl -i http://localhost:3000/api/dispatch?date=2026-03-02
```

### 3) RLS Isolation Check

In Supabase SQL editor, with two users in different companies:

```sql
-- As user A (or via a user-scoped client), should only return company A rows.
select id, company_id from jobs;

-- Cross-company direct fetch should return zero rows under RLS.
select id
from jobs
where company_id = 'COMPANY_B_UUID';
```

Expected: user A cannot read/write company B data.

## Security Notes

- No service-role key is required by app runtime.
- All app/API access is session-based.
- Company scoping is enforced in both application queries and database RLS policies.
