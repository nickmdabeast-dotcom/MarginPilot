-- Migration: 0001_initial_schema
-- Description: Initial tables for MarginPilot

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────
-- companies
-- ─────────────────────────────────────────────
create table companies (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- technicians
-- ─────────────────────────────────────────────
create table technicians (
  id         uuid        primary key default gen_random_uuid(),
  company_id uuid        not null references companies (id) on delete cascade,
  name       text        not null,
  truck_id   text        not null,
  created_at timestamptz not null default now()
);

create index technicians_company_id_idx on technicians (company_id);

-- ─────────────────────────────────────────────
-- jobs
-- ─────────────────────────────────────────────
create table jobs (
  id                       uuid    primary key default gen_random_uuid(),
  company_id               uuid    not null references companies (id) on delete cascade,
  technician_id            uuid    references technicians (id) on delete set null,
  job_date                 date    not null,
  revenue_estimate         numeric not null check (revenue_estimate >= 0),
  duration_estimate_hours  numeric not null check (duration_estimate_hours > 0),
  urgency                  integer not null check (urgency between 1 and 5),
  created_at               timestamptz not null default now()
);

create index jobs_company_id_idx    on jobs (company_id);
create index jobs_technician_id_idx on jobs (technician_id);
create index jobs_job_date_idx      on jobs (job_date);

-- ─────────────────────────────────────────────
-- optimization_runs
-- ─────────────────────────────────────────────
create table optimization_runs (
  id                   uuid    primary key default gen_random_uuid(),
  company_id           uuid    not null references companies (id) on delete cascade,
  run_date             date    not null,
  total_revenue_before numeric not null check (total_revenue_before >= 0),
  total_revenue_after  numeric not null check (total_revenue_after >= 0),
  created_at           timestamptz not null default now()
);

create index optimization_runs_company_id_idx on optimization_runs (company_id);
create index optimization_runs_run_date_idx   on optimization_runs (run_date);
