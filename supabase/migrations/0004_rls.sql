-- Migration: 0004_rls
-- Description: Row Level Security policies for all company-scoped tables.
--
-- Depends on: 0003_profiles_and_auth (profiles table + current_user_company_id()).
--
-- Every policy uses current_user_company_id() so that authenticated users
-- can only access rows belonging to their own company.

-- ---------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------
alter table if exists public.companies enable row level security;
alter table if exists public.profiles enable row level security;
alter table if exists public.technicians enable row level security;
alter table if exists public.jobs enable row level security;
alter table if exists public.optimization_runs enable row level security;
alter table if exists public.customers enable row level security;
alter table if exists public.leads enable row level security;

-- ---------------------------------------------------------
-- companies
-- ---------------------------------------------------------
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

-- ---------------------------------------------------------
-- profiles
-- ---------------------------------------------------------
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

-- ---------------------------------------------------------
-- technicians
-- ---------------------------------------------------------
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

-- ---------------------------------------------------------
-- jobs
-- ---------------------------------------------------------
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

-- ---------------------------------------------------------
-- optimization_runs
-- ---------------------------------------------------------
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

-- ---------------------------------------------------------
-- customers
-- ---------------------------------------------------------
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

-- ---------------------------------------------------------
-- leads
-- ---------------------------------------------------------
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

-- ---------------------------------------------------------
-- Optional tables (if they exist and have company_id)
-- ---------------------------------------------------------
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
