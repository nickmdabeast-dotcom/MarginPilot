-- ═══════════════════════════════════════════════════════════════
-- MarginPilot — Full Setup Script
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════

-- 1. Extensions
create extension if not exists "pgcrypto";

-- 2. companies
create table if not exists companies (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  created_at timestamptz not null default now()
);

-- 3. technicians
create table if not exists technicians (
  id         uuid        primary key default gen_random_uuid(),
  company_id uuid        not null references companies (id) on delete cascade,
  name       text        not null,
  truck_id   text        not null default 'UNASSIGNED',
  created_at timestamptz not null default now()
);

create index if not exists technicians_company_id_idx on technicians (company_id);

-- 4. jobs
create table if not exists jobs (
  id                      uuid        primary key default gen_random_uuid(),
  company_id              uuid        not null references companies (id) on delete cascade,
  technician_id           uuid        references technicians (id) on delete set null,
  job_date                date        not null,
  revenue_estimate        numeric     not null check (revenue_estimate >= 0),
  duration_estimate_hours numeric     not null check (duration_estimate_hours > 0),
  urgency                 integer     not null check (urgency between 1 and 5),
  created_at              timestamptz not null default now()
);

create index if not exists jobs_company_id_idx    on jobs (company_id);
create index if not exists jobs_technician_id_idx on jobs (technician_id);
create index if not exists jobs_job_date_idx      on jobs (job_date);

-- 5. optimization_runs
create table if not exists optimization_runs (
  id                   uuid        primary key default gen_random_uuid(),
  company_id           uuid        not null references companies (id) on delete cascade,
  run_date             date        not null,
  total_revenue_before numeric     not null check (total_revenue_before >= 0),
  total_revenue_after  numeric     not null check (total_revenue_after >= 0),
  created_at           timestamptz not null default now()
);

create index if not exists optimization_runs_company_id_idx on optimization_runs (company_id);
create index if not exists optimization_runs_run_date_idx   on optimization_runs (run_date);

-- 6. Verify
select 'companies' as tbl, count(*) from companies
union all
select 'technicians', count(*) from technicians
union all
select 'jobs', count(*) from jobs
union all
select 'optimization_runs', count(*) from optimization_runs;
