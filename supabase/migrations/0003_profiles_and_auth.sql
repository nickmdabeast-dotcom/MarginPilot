-- Migration: 0003_profiles_and_auth
-- Description: User profiles table and onboarding helpers.
--
-- Schema notes:
--   profiles.user_id  — references auth.users(id); UNIQUE so each Supabase Auth
--                        user maps to exactly one profile row.
--   profiles.company_id — FK to companies; every profile belongs to a company.
--                          lib/auth.ts → requireCompanyId() reads this to derive
--                          the session company_id for all API routes.
--   profiles.role     — free-text role, defaults to 'owner' for the first user
--                        who creates the company via onboarding.
--
-- Functions:
--   current_user_company_id() — thin SQL helper used by future RLS policies and
--                                any context that needs the caller's company_id.
--   ensure_user_profile()     — called by /api/auth/onboarding.  Idempotent:
--                                returns existing company_id if profile exists,
--                                otherwise creates company + profile atomically.
--                                Uses pg_advisory_xact_lock to prevent races.
--   handle_new_auth_user()    — trigger on auth.users INSERT; auto-provisions a
--                                company + profile so users have a profile even
--                                if the frontend onboarding call is skipped.
--
-- RLS is intentionally NOT enabled here (separate migration).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------
-- profiles
-- ---------------------------------------------------------
create table if not exists public.profiles (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null unique,
  company_id uuid        not null references public.companies(id) on delete cascade,
  role       text        not null default 'owner',
  created_at timestamptz not null default now()
);

create index if not exists profiles_company_id_idx on public.profiles(company_id);
-- Unique index backs the UNIQUE constraint on user_id but is declared
-- explicitly so the name is stable across environments.
create unique index if not exists profiles_user_id_key on public.profiles(user_id);

-- ---------------------------------------------------------
-- current_user_company_id()
-- ---------------------------------------------------------
-- Returns the authenticated user's company_id from profiles.
-- Used by RLS policies (applied in a later migration) and can be called
-- directly from SQL when the session context is available.
create or replace function public.current_user_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id
  from public.profiles
  where user_id = auth.uid()
  limit 1;
$$;

-- ---------------------------------------------------------
-- ensure_user_profile(p_company_name text)
-- ---------------------------------------------------------
-- Called by POST /api/auth/onboarding.
-- Idempotent: if the user already has a profile, returns their company_id.
-- Otherwise creates a new company (using the supplied name or a fallback
-- derived from the user's email) and a profile row, then returns the
-- new company_id.
--
-- security definer so it can read auth.users and write to companies/profiles
-- regardless of RLS state.
create or replace function public.ensure_user_profile(p_company_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_email text;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  -- Prevent concurrent onboarding for the same user.
  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  -- Fast path: profile already exists.
  select company_id
  into v_company_id
  from public.profiles
  where user_id = v_user_id
  limit 1;

  if v_company_id is not null then
    return v_company_id;
  end if;

  -- Derive a fallback company name from the user's email.
  select email
  into v_email
  from auth.users
  where id = v_user_id;

  insert into public.companies (name)
  values (
    coalesce(
      nullif(trim(p_company_name), ''),
      case
        when v_email is not null and position('@' in v_email) > 1
          then split_part(v_email, '@', 1) || '''s Company'
        else 'New Company'
      end
    )
  )
  returning id into v_company_id;

  insert into public.profiles (user_id, company_id, role)
  values (v_user_id, v_company_id, 'owner');

  return v_company_id;
end;
$$;

-- ---------------------------------------------------------
-- handle_new_auth_user()  (trigger)
-- ---------------------------------------------------------
-- Auto-provisions a company + profile on auth.users INSERT so that every
-- signed-up user has a profile row even without hitting /api/auth/onboarding.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_company_name text;
begin
  perform pg_advisory_xact_lock(hashtext(new.id::text));

  if exists (select 1 from public.profiles where user_id = new.id) then
    return new;
  end if;

  v_company_name := case
    when new.email is not null and position('@' in new.email) > 1
      then split_part(new.email, '@', 1) || '''s Company'
    else 'New Company'
  end;

  insert into public.companies (name)
  values (v_company_name)
  returning id into v_company_id;

  insert into public.profiles (user_id, company_id, role)
  values (new.id, v_company_id, 'owner');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

-- ---------------------------------------------------------
-- Grants
-- ---------------------------------------------------------
-- Only authenticated users should call these functions.
-- Revoke from public (anonymous) role first.
revoke all on function public.current_user_company_id() from public;
revoke all on function public.ensure_user_profile(text) from public;
grant execute on function public.current_user_company_id() to authenticated;
grant execute on function public.ensure_user_profile(text) to authenticated;
