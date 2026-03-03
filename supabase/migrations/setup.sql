-- =====================================================================
-- MarginPilot — Full Setup Script  (consolidated from 0001–0004)
-- Run this in: Supabase Dashboard -> SQL Editor -> New Query
--
-- For incremental migration, run 0001, 0002, 0003, 0004 in order instead.
--
-- Migration inventory:
--   0001_initial_schema    — companies, technicians, jobs, optimization_runs
--   0002_leads_dispatch    — customers, leads, dispatch columns on jobs
--   0003_profiles_and_auth — profiles table, onboarding RPC, auth trigger
--   0004_rls               — row level security policies (all tables)
-- =====================================================================

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────
-- companies
-- ─────────────────────────────────────────────
create table if not exists companies (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- technicians
-- ─────────────────────────────────────────────
create table if not exists technicians (
  id         uuid        primary key default gen_random_uuid(),
  company_id uuid        not null references companies(id) on delete cascade,
  name       text        not null,
  truck_id   text        not null default 'UNASSIGNED',
  created_at timestamptz not null default now()
);

create index if not exists technicians_company_id_idx on technicians(company_id);

-- ─────────────────────────────────────────────
-- customers
-- ─────────────────────────────────────────────
create table if not exists customers (
  id         uuid        primary key default gen_random_uuid(),
  company_id uuid        not null references companies(id) on delete cascade,
  full_name  text        not null,
  phone      text        not null,
  email      text,
  address    text,
  created_at timestamptz default now()
);

create index if not exists customers_company_id_idx on customers(company_id);

-- ─────────────────────────────────────────────
-- jobs  (includes dispatch columns from 0002)
-- ─────────────────────────────────────────────
create table if not exists jobs (
  id                      uuid        primary key default gen_random_uuid(),
  company_id              uuid        not null references companies(id) on delete cascade,
  technician_id           uuid        references technicians(id) on delete set null,
  customer_id             uuid        references customers(id) on delete set null,
  job_date                date        not null,
  revenue_estimate        numeric     not null check (revenue_estimate >= 0),
  duration_estimate_hours numeric     not null check (duration_estimate_hours > 0),
  urgency                 integer     not null check (urgency between 1 and 5),
  status                  text        default 'scheduled',
  earliest_start          timestamptz,
  latest_end              timestamptz,
  scheduled_start         timestamptz,
  scheduled_end           timestamptz,
  order_index             integer     default 0,
  created_at              timestamptz not null default now()
);

create index if not exists jobs_company_id_idx      on jobs(company_id);
create index if not exists jobs_technician_id_idx   on jobs(technician_id);
create index if not exists jobs_job_date_idx        on jobs(job_date);
create index if not exists jobs_status_idx          on jobs(status);
create index if not exists jobs_customer_id_idx     on jobs(customer_id);
create index if not exists jobs_dispatch_order_idx  on jobs(company_id, job_date, technician_id, order_index);

-- ─────────────────────────────────────────────
-- leads
-- ─────────────────────────────────────────────
create table if not exists leads (
  id          uuid        primary key default gen_random_uuid(),
  company_id  uuid        not null references companies(id) on delete cascade,
  customer_id uuid        references customers(id) on delete set null,
  source      text        default 'website',
  service_type text,
  urgency     text        default 'soon',
  status      text        default 'new',
  notes       text,
  created_at  timestamptz default now()
);

create index if not exists leads_company_id_idx  on leads(company_id);
create index if not exists leads_customer_id_idx on leads(customer_id);
create index if not exists leads_status_idx      on leads(status);

-- ─────────────────────────────────────────────
-- optimization_runs  (includes dispatch_plan from 0002)
-- ─────────────────────────────────────────────
create table if not exists optimization_runs (
  id                   uuid        primary key default gen_random_uuid(),
  company_id           uuid        not null references companies(id) on delete cascade,
  run_date             date        not null,
  total_revenue_before numeric     not null check (total_revenue_before >= 0),
  total_revenue_after  numeric     not null check (total_revenue_after >= 0),
  dispatch_plan        jsonb,
  created_at           timestamptz not null default now()
);

create index if not exists optimization_runs_company_id_idx on optimization_runs(company_id);
create index if not exists optimization_runs_run_date_idx   on optimization_runs(run_date);

-- ─────────────────────────────────────────────
-- profiles  (from 0003)
-- ─────────────────────────────────────────────
create table if not exists profiles (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null unique,
  company_id uuid        not null references companies(id) on delete cascade,
  role       text        not null default 'owner',
  created_at timestamptz not null default now()
);

create index if not exists profiles_company_id_idx on profiles(company_id);
create unique index if not exists profiles_user_id_key on profiles(user_id);

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
-- Row Level Security
-- ─────────────────────────────────────────────
alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.technicians enable row level security;
alter table public.jobs enable row level security;
alter table public.optimization_runs enable row level security;
alter table public.customers enable row level security;
alter table public.leads enable row level security;

-- companies
create policy companies_select_own on public.companies for select to authenticated
  using (id = public.current_user_company_id());
create policy companies_update_own on public.companies for update to authenticated
  using (id = public.current_user_company_id())
  with check (id = public.current_user_company_id());

-- profiles
create policy profiles_select_own on public.profiles for select to authenticated
  using (user_id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and company_id = public.current_user_company_id());

-- technicians
create policy technicians_select_company on public.technicians for select to authenticated
  using (company_id = public.current_user_company_id());
create policy technicians_insert_company on public.technicians for insert to authenticated
  with check (company_id = public.current_user_company_id());
create policy technicians_update_company on public.technicians for update to authenticated
  using (company_id = public.current_user_company_id())
  with check (company_id = public.current_user_company_id());
create policy technicians_delete_company on public.technicians for delete to authenticated
  using (company_id = public.current_user_company_id());

-- jobs
create policy jobs_select_company on public.jobs for select to authenticated
  using (company_id = public.current_user_company_id());
create policy jobs_insert_company on public.jobs for insert to authenticated
  with check (company_id = public.current_user_company_id());
create policy jobs_update_company on public.jobs for update to authenticated
  using (company_id = public.current_user_company_id())
  with check (company_id = public.current_user_company_id());
create policy jobs_delete_company on public.jobs for delete to authenticated
  using (company_id = public.current_user_company_id());

-- optimization_runs
create policy optimization_runs_select_company on public.optimization_runs for select to authenticated
  using (company_id = public.current_user_company_id());
create policy optimization_runs_insert_company on public.optimization_runs for insert to authenticated
  with check (company_id = public.current_user_company_id());
create policy optimization_runs_update_company on public.optimization_runs for update to authenticated
  using (company_id = public.current_user_company_id())
  with check (company_id = public.current_user_company_id());
create policy optimization_runs_delete_company on public.optimization_runs for delete to authenticated
  using (company_id = public.current_user_company_id());

-- customers
create policy customers_select_company on public.customers for select to authenticated
  using (company_id = public.current_user_company_id());
create policy customers_insert_company on public.customers for insert to authenticated
  with check (company_id = public.current_user_company_id());
create policy customers_update_company on public.customers for update to authenticated
  using (company_id = public.current_user_company_id())
  with check (company_id = public.current_user_company_id());
create policy customers_delete_company on public.customers for delete to authenticated
  using (company_id = public.current_user_company_id());

-- leads
create policy leads_select_company on public.leads for select to authenticated
  using (company_id = public.current_user_company_id());
create policy leads_insert_company on public.leads for insert to authenticated
  with check (company_id = public.current_user_company_id());
create policy leads_update_company on public.leads for update to authenticated
  using (company_id = public.current_user_company_id())
  with check (company_id = public.current_user_company_id());
create policy leads_delete_company on public.leads for delete to authenticated
  using (company_id = public.current_user_company_id());

-- ─────────────────────────────────────────────
-- Verify
-- ─────────────────────────────────────────────
select 'companies'         as tbl, count(*) from companies
union all
select 'profiles',                  count(*) from profiles
union all
select 'technicians',               count(*) from technicians
union all
select 'customers',                 count(*) from customers
union all
select 'jobs',                      count(*) from jobs
union all
select 'leads',                     count(*) from leads
union all
select 'optimization_runs',         count(*) from optimization_runs;
