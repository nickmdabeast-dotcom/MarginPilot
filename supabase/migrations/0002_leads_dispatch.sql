-- ═══════════════════════════════════════════════════════════════
-- HVAC Revenue OS — Leads + Dispatch Extension
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════

-- 1. CUSTOMERS
create table if not exists customers (
  id         uuid        primary key default gen_random_uuid(),
  company_id uuid        not null references companies(id) on delete cascade,
  full_name  text        not null,
  phone      text        not null,
  email      text,
  address    text,
  created_at timestamptz default now()
);

create index if not exists customers_company_id_idx on customers (company_id);

-- 2. LEADS
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

create index if not exists leads_company_id_idx  on leads (company_id);
create index if not exists leads_customer_id_idx on leads (customer_id);
create index if not exists leads_status_idx      on leads (status);

-- 3. EXTEND JOBS FOR DISPATCH
-- Do not modify existing fields — only add new columns.
alter table jobs
  add column if not exists customer_id      uuid        references customers(id) on delete set null,
  add column if not exists status           text        default 'scheduled',
  add column if not exists earliest_start   timestamptz,
  add column if not exists latest_end       timestamptz,
  add column if not exists scheduled_start  timestamptz,
  add column if not exists scheduled_end    timestamptz,
  add column if not exists order_index      integer     default 0;

create index if not exists jobs_status_idx           on jobs (status);
create index if not exists jobs_customer_id_idx      on jobs (customer_id);
create index if not exists jobs_dispatch_order_idx   on jobs (company_id, job_date, technician_id, order_index);

-- 4. EXTEND optimization_runs TO STORE DISPATCH PLAN
-- Enables /api/dispatch/apply-optimization to look up assignments by run_id.
alter table optimization_runs
  add column if not exists dispatch_plan jsonb;

-- 5. Verify
select 'customers'         as tbl, count(*) from customers
union all
select 'leads',                     count(*) from leads
union all
select 'jobs (with new cols)',       count(*) from jobs
union all
select 'optimization_runs',         count(*) from optimization_runs;
