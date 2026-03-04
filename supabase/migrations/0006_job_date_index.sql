-- Migration: 0006_job_date_index
-- Description: Add composite index on (company_id, job_date) for range queries
-- Used by: GET /api/dispatch?start=...&end=... (week view)

CREATE INDEX IF NOT EXISTS jobs_company_jobdate_idx
  ON public.jobs (company_id, job_date);
