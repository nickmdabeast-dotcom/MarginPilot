-- Migration: 0005_job_idempotency
-- Description: Add columns and unique index for production-safe CSV idempotency
--
-- New columns:
--   job_name        — human-readable job description (from CSV)
--   external_job_id — external identifier (from CSV job_id column)
--   job_signature   — stable business identity key for dedup
--   row_hash        — content hash of mutable fields for change detection
--
-- Unique index:
--   (company_id, job_signature) — partial, only where job_signature IS NOT NULL
--   so legacy rows without signatures don't conflict.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS job_name        TEXT,
  ADD COLUMN IF NOT EXISTS external_job_id TEXT,
  ADD COLUMN IF NOT EXISTS job_signature   TEXT,
  ADD COLUMN IF NOT EXISTS row_hash        TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS jobs_company_signature_uq
  ON jobs (company_id, job_signature)
  WHERE job_signature IS NOT NULL;
