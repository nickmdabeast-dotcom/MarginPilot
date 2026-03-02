import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types";
import type { ParsedRow } from "@/lib/csv";
import type { JobInput } from "@/lib/optimize";

type DbClient = SupabaseClient<Database>;

// ─── Validation ───────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ValidJobRow {
  job_date: string;
  technician_name: string;
  revenue_estimate: number;
  duration_estimate_hours: number;
  urgency: number;
}

export interface RowError {
  row: number;
  message: string;
}

export type ValidationResult =
  | { ok: true; data: ValidJobRow }
  | { ok: false; error: RowError };

/**
 * Validates a single parsed CSV row against the expected job schema.
 * `rowIndex` is the 1-based row number used for error messages (header = 1,
 * so the first data row is typically 2).
 */
export function validateJobRow(
  raw: ParsedRow,
  rowIndex: number
): ValidationResult {
  const revenue = Number(raw.revenue_estimate);
  const duration = Number(raw.duration_estimate_hours);
  const urgency = Number(raw.urgency);

  if (!raw.technician_name?.trim()) {
    return { ok: false, error: { row: rowIndex, message: "technician_name is required" } };
  }
  if (isNaN(revenue) || revenue < 0) {
    return { ok: false, error: { row: rowIndex, message: `invalid revenue_estimate: "${raw.revenue_estimate}"` } };
  }
  if (isNaN(duration) || duration <= 0) {
    return { ok: false, error: { row: rowIndex, message: `invalid duration_estimate_hours: "${raw.duration_estimate_hours}"` } };
  }
  if (!Number.isInteger(urgency) || urgency < 1 || urgency > 5) {
    return { ok: false, error: { row: rowIndex, message: `urgency must be 1–5, got "${raw.urgency}"` } };
  }
  if (!DATE_RE.test(raw.job_date ?? "")) {
    return { ok: false, error: { row: rowIndex, message: `job_date must be YYYY-MM-DD, got "${raw.job_date}"` } };
  }

  return {
    ok: true,
    data: {
      job_date: raw.job_date,
      technician_name: raw.technician_name.trim(),
      revenue_estimate: revenue,
      duration_estimate_hours: duration,
      urgency,
    },
  };
}

// ─── Insertion ────────────────────────────────────────────────────────────────

export interface InsertJobsParams {
  rows: ValidJobRow[];
  companyId: string;
  db: DbClient;
  /** Resolves a technician display name to its DB UUID. */
  getTechnicianId: (name: string) => Promise<string>;
}

export interface InsertJobsResult {
  inserted: number;
  failed: RowError[];
}

/**
 * Inserts a batch of validated job rows into the database.
 * Failures are collected per-row so callers receive a partial-success summary
 * rather than an all-or-nothing outcome.
 */
export async function insertJobs({
  rows,
  companyId,
  db,
  getTechnicianId,
}: InsertJobsParams): Promise<InsertJobsResult> {
  let inserted = 0;
  const failed: RowError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const techId = await getTechnicianId(row.technician_name);
      const { error } = await db.from("jobs").insert({
        company_id: companyId,
        technician_id: techId,
        job_date: row.job_date,
        revenue_estimate: row.revenue_estimate,
        duration_estimate_hours: row.duration_estimate_hours,
        urgency: row.urgency,
      });

      if (error) {
        failed.push({ row: i + 2, message: error.message });
      } else {
        inserted++;
      }
    } catch (err) {
      failed.push({
        row: i + 2,
        message: err instanceof Error ? err.message : "Unknown insertion error",
      });
    }
  }

  return { inserted, failed };
}

// ─── Fetching ─────────────────────────────────────────────────────────────────

interface JobDbRow {
  id: string;
  technician_id: string | null;
  revenue_estimate: number;
  duration_estimate_hours: number;
  urgency: number;
  technicians: { name: string } | null;
}

/**
 * Fetches all jobs for a given company and date, joining the technician name.
 * Returns data shaped as `JobInput[]` ready for the optimisation engine.
 */
export async function getJobsByDate(
  companyId: string,
  date: string,
  db: DbClient
): Promise<JobInput[]> {
  const { data, error } = await db
    .from("jobs")
    .select("*, technicians(name)")
    .eq("company_id", companyId)
    .eq("job_date", date);

  if (error) throw new Error(`Failed to fetch jobs: ${error.message}`);
  if (!data) return [];

  return (data as unknown as JobDbRow[]).map((row) => {
    // PostgREST may return the join as an object or a single-element array depending on the client version
    const tech = Array.isArray(row.technicians) ? row.technicians[0] : row.technicians;
    return {
      id: row.id,
      technician_id: row.technician_id ?? "unassigned",
      technician_name: tech?.name ?? "Unknown",
      revenue_estimate: Number(row.revenue_estimate),
      duration_estimate_hours: Number(row.duration_estimate_hours),
      urgency: Number(row.urgency),
    };
  });
}
