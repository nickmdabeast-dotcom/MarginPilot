import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types";
import type { ParsedRow } from "@/lib/csv";
import type { JobInput } from "@/lib/optimize";

type DbClient = SupabaseClient<Database>;

// ─── Validation ───────────────────────────────────────────────────────────────

const DATE_YYYYMMDD = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MMDDYYYY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/** Maps text urgency labels to numeric 1–5 values. */
const URGENCY_LABELS: Record<string, number> = {
  critical: 5, emergency: 5, urgent: 5, high: 5,
  medium: 3, med: 3, normal: 3, moderate: 3, standard: 3,
  low: 1, minor: 1, routine: 1,
};

/** Strips currency symbols and thousands-separator commas before parsing. */
function parseRevenue(raw: string): number {
  return parseFloat(raw.replace(/[$,]/g, "").trim());
}

/** Handles plain hours, values with units ("2.5h", "150m"), and minutes→hours. */
function parseDuration(raw: string): number {
  const cleaned = raw.trim().toLowerCase();
  // "150min" or "150m" → minutes
  const minMatch = cleaned.match(/^([\d.]+)\s*m(?:in(?:utes?)?)?$/);
  if (minMatch) return parseFloat(minMatch[1]) / 60;
  // "2.5h" or "2.5hr(s)"
  const hrMatch = cleaned.match(/^([\d.]+)\s*h(?:r?s?)?$/);
  if (hrMatch) return parseFloat(hrMatch[1]);
  return parseFloat(cleaned);
}

/** Parses YYYY-MM-DD or MM/DD/YYYY → YYYY-MM-DD, or returns null. */
function parseDate(raw: string): string | null {
  const trimmed = (raw ?? "").trim();
  if (DATE_YYYYMMDD.test(trimmed)) return trimmed;
  const m = trimmed.match(DATE_MMDDYYYY);
  if (m) {
    const [, month, day, year] = m;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return null;
}

/** Parses urgency from 1-5 integer or label ("high", "low", etc.). */
function parseUrgency(raw: string): number | null {
  const trimmed = (raw ?? "").trim().toLowerCase();
  // Try numeric first
  const n = parseInt(trimmed, 10);
  if (!isNaN(n)) return n;
  // Try label
  return URGENCY_LABELS[trimmed] ?? null;
}

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
 *
 * Coercions applied:
 *   revenue_estimate    — strips $, commas, then parseFloat
 *   duration_estimate_hours — handles "2.5h", "150m/min", plain number
 *   urgency             — accepts 1-5 integer OR label (high/med/low)
 *   job_date            — accepts YYYY-MM-DD or MM/DD/YYYY
 */
export function validateJobRow(
  raw: ParsedRow,
  rowIndex: number
): ValidationResult {
  if (!raw.technician_name?.trim()) {
    return { ok: false, error: { row: rowIndex, message: "technician_name is required" } };
  }

  const revenue = parseRevenue(raw.revenue_estimate ?? "");
  if (isNaN(revenue) || revenue < 0) {
    return { ok: false, error: { row: rowIndex, message: `invalid revenue — got "${raw.revenue_estimate}" (expected a number, e.g. "$150" or "150.00")` } };
  }

  const duration = parseDuration(raw.duration_estimate_hours ?? "");
  if (isNaN(duration) || duration <= 0) {
    return { ok: false, error: { row: rowIndex, message: `invalid duration — got "${raw.duration_estimate_hours}" (expected hours like "2.5", "2.5h", or "150min")` } };
  }

  const urgency = parseUrgency(raw.urgency ?? "");
  if (urgency === null || urgency < 1 || urgency > 5) {
    return { ok: false, error: { row: rowIndex, message: `invalid urgency — got "${raw.urgency}" (expected 1–5 or "high"/"medium"/"low")` } };
  }

  const jobDate = parseDate(raw.job_date ?? "");
  if (!jobDate) {
    return { ok: false, error: { row: rowIndex, message: `invalid date — got "${raw.job_date}" (expected YYYY-MM-DD or MM/DD/YYYY)` } };
  }

  return {
    ok: true,
    data: {
      job_date: jobDate,
      technician_name: raw.technician_name.trim(),
      revenue_estimate: revenue,
      duration_estimate_hours: duration,
      urgency: Math.round(urgency),
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
