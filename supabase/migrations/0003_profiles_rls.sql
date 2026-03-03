-- Migration: 0003_profiles_rls
-- Description: Add user profiles, onboarding helpers, and company-scoped RLS.

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────
-- profiles
-- ─────────────────────────────────────────────
create table if not exists public.profiles (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null unique,
  company_id uuid        not null references public.companies(id) on delete cascade,
  role       text        not null default 'owner',
  created_at timestamptz not null default now()
);

create index if not exists profiles_company_id_idx on public.profiles(company_id);
create unique index if not exists profiles_user_id_key on public.profiles(user_id);

-- ─────────────────────────────────────────────
-- Auth-context helpers
-- ─────────────────────────────────────────────
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

  perform pg_advisory_xact_lock(hashtext(v_user_id::text));

  select company_id
  into v_company_id
  from public.profiles
  where user_id = v_user_id
  limit 1;

  if v_company_id is not null then
    return v_company_id;
  end if;

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

revoke all on function public.current_user_company_id() from public;
revoke all on function public.ensure_user_profile(text) from public;
grant execute on function public.current_user_company_id() to authenticated;
grant execute on function public.ensure_user_profile(text) to authenticated;

-- ─────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────
alter table if exists public.companies enable row level security;
alter table if exists public.profiles enable row level security;
alter table if exists public.technicians enable row level security;
alter table if exists public.jobs enable row level security;
alter table if exists public.optimization_runs enable row level security;
alter table if exists public.customers enable row level security;
alter table if exists public.leads enable row level security;

drop policy if exists companies_select_own on public.companies;
drop policy if exists companies_update_own on public.companies;
create policy companies_select_own
  on public.companies
  for select
  to authenticated
  using (id = public.current_user_company_id());
create policy companies_update_own
  on public.companies
  for update
  to authenticated
  using (id = public.current_user_company_id())
  with check (id = public.current_user_company_id());

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (user_id = auth.uid());
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and company_id = public.current_user_company_id());

drop policy if exists technicians_select_company on public.technicians;
drop policy if exists technicians_insert_company on public.technicians;
drop policy if exists technicians_update_company on public.technicians;
drop policy if exists technicians_delete_company on public.technicians;
create policy technicians_select_company
  on public.technicians
  for select
  to authenticated
  using (company_id = public.current_user_company_id());
create policy technicians_insert_company
  on public.technicians
  for insert
  to authenticated
  with check (company_id = public.current_user_company_id());
create policy technicians_update_company
  on public.technicians
  for update
  to authenticated
  using (company_id = public.current_user_company_id())
  with check (company_id = public.current_user_company_id());
create policy technicians_delete_company
  on public.technicians
  for delete
  to authenticated
  using (company_id = public.current_user_company_id());

drop policy if exists jobs_select_company on public.jobs;
drop policy if exists jobs_insert_company on public.jobs;
drop policy if exists jobs_update_company on public.jobs;
drop policy if exists jobs_delete_company on public.jobs;
create policy jobs_select_company
  on public.jobs
  for select
  to authenticated
  using (company_id = public.current_user_company_id());
create policy jobs_insert_company
  on public.jobs
  for insert
  to authenticated
  with check (company_id = public.current_user_company_id());
create policy jobs_update_company
  on public.jobs
  for update
  to authenticated
  using (company_id = public.current_user_company_id())
  with check (company_id = public.current_user_company_id());
create policy jobs_delete_company
  on public.jobs
  for delete
  to authenticated
  using (company_id = public.current_user_company_id());

drop policy if exists optimization_runs_select_company on public.optimization_runs;
drop policy if exists optimization_runs_insert_company on public.optimization_runs;
drop policy if exists optimization_runs_update_company on public.optimization_runs;
drop policy if exists optimization_runs_delete_company on public.optimization_runs;
create policy optimization_runs_select_company
  on public.optimization_runs
  for select
  to authenticated
  using (company_id = public.current_user_company_id());
create policy optimization_runs_insert_company
  on public.optimization_runs
  for insert
  to authenticated
  with check (company_id = public.current_user_company_id());
create policy optimization_runs_update_company
  on public.optimization_runs
  for update
  to authenticated
  using (company_id = public.current_user_company_id())
  with check (company_id = public.current_user_company_id());
create policy optimization_runs_delete_company
  on public.optimization_runs
  for delete
  to authenticated
  using (company_id = public.current_user_company_id());

drop policy if exists customers_select_company on public.customers;
drop policy if exists customers_insert_company on public.customers;
drop policy if exists customers_update_company on public.customers;
drop policy if exists customers_delete_company on public.customers;
create policy customers_select_company
  on public.customers
  for select
  to authenticated
  using (company_id = public.current_user_company_id());
create policy customers_insert_company
  on public.customers
  for insert
  to authenticated
  with check (company_id = public.current_user_company_id());
create policy customers_update_company
  on public.customers
  for update
  to authenticated
  using (company_id = public.current_user_company_id())
  with check (company_id = public.current_user_company_id());
create policy customers_delete_company
  on public.customers
  for delete
  to authenticated
  using (company_id = public.current_user_company_id());

drop policy if exists leads_select_company on public.leads;
drop policy if exists leads_insert_company on public.leads;
drop policy if exists leads_update_company on public.leads;
drop policy if exists leads_delete_company on public.leads;
create policy leads_select_company
  on public.leads
  for select
  to authenticated
  using (company_id = public.current_user_company_id());
create policy leads_insert_company
  on public.leads
  for insert
  to authenticated
  with check (company_id = public.current_user_company_id());
create policy leads_update_company
  on public.leads
  for update
  to authenticated
  using (company_id = public.current_user_company_id())
  with check (company_id = public.current_user_company_id());
create policy leads_delete_company
  on public.leads
  for delete
  to authenticated
  using (company_id = public.current_user_company_id());

do $$
declare
  optional_table text;
begin
  foreach optional_table in array array['messages', 'conversations', 'appointments']
  loop
    if to_regclass('public.' || optional_table) is not null
       and exists (
         select 1
         from information_schema.columns
         where table_schema = 'public'
           and table_name = optional_table
           and column_name = 'company_id'
       ) then
      execute format('alter table public.%I enable row level security', optional_table);

      execute format('drop policy if exists %I_select_company on public.%I', optional_table, optional_table);
      execute format('drop policy if exists %I_insert_company on public.%I', optional_table, optional_table);
      execute format('drop policy if exists %I_update_company on public.%I', optional_table, optional_table);
      execute format('drop policy if exists %I_delete_company on public.%I', optional_table, optional_table);

      execute format(
        'create policy %I_select_company on public.%I for select to authenticated using (company_id = public.current_user_company_id())',
        optional_table,
        optional_table
      );
      execute format(
        'create policy %I_insert_company on public.%I for insert to authenticated with check (company_id = public.current_user_company_id())',
        optional_table,
        optional_table
      );
      execute format(
        'create policy %I_update_company on public.%I for update to authenticated using (company_id = public.current_user_company_id()) with check (company_id = public.current_user_company_id())',
        optional_table,
        optional_table
      );
      execute format(
        'create policy %I_delete_company on public.%I for delete to authenticated using (company_id = public.current_user_company_id())',
        optional_table,
        optional_table
      );
    end if;
  end loop;
end
$$;
