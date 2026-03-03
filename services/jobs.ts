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
function parseDurationHours(rawHours: string, rawMinutes: string): number {
  const mins = parseFloat((rawMinutes ?? "").trim());
  if (!isNaN(mins) && mins > 0) {
    return mins / 60;
  }

  const cleaned = (rawHours ?? "").trim().toLowerCase();
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
  sourceRow: number;
  schedule_date: string;
  job_id: string;
  job_name: string;
  technician_name: string;
  revenue: number;
  duration_hours: number;
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
 *   revenue             — strips $, commas, then parseFloat
 *   duration_hours      — handles "2.5h", "150m/min", plain number
 *   urgency             — accepts 1-5 integer OR label (high/med/low)
 *   schedule_date       — accepts YYYY-MM-DD or MM/DD/YYYY
 */
export function validateJobRow(
  raw: ParsedRow,
  rowIndex: number,
  fallbackDate?: string
): ValidationResult {
  const trimmedTechName = raw.technician_name?.trim() ?? "";
  if (!trimmedTechName) {
    return { ok: false, error: { row: rowIndex, message: "technician_name is required" } };
  }

  const trimmedJobId = raw.job_id?.trim() ?? "";
  if (!trimmedJobId) {
    return { ok: false, error: { row: rowIndex, message: "job_id is required" } };
  }

  const trimmedJobName = raw.job_name?.trim() ?? "";
  if (!trimmedJobName) {
    return { ok: false, error: { row: rowIndex, message: "job_name is required" } };
  }

  const revenue = parseRevenue(raw.revenue ?? "");
  if (isNaN(revenue) || revenue < 0) {
    return { ok: false, error: { row: rowIndex, message: `invalid revenue — got "${raw.revenue}" (expected a number, e.g. "$150" or "150.00")` } };
  }

  const duration = parseDurationHours(raw.duration_hours ?? "", raw.duration_minutes ?? "");
  if (isNaN(duration) || duration <= 0) {
    return { ok: false, error: { row: rowIndex, message: `invalid duration — got "${raw.duration_hours ?? raw.duration_minutes}" (expected hours like "2.5", "2.5h", or minutes like "150")` } };
  }

  const urgency = parseUrgency(raw.urgency ?? "");
  if (urgency === null || urgency < 1 || urgency > 5) {
    return { ok: false, error: { row: rowIndex, message: `invalid urgency — got "${raw.urgency}" (expected 1–5 or "high"/"medium"/"low")` } };
  }

  const scheduleDate = parseDate(raw.schedule_date ?? "") ?? (fallbackDate || null);
  if (!scheduleDate) {
    return { ok: false, error: { row: rowIndex, message: `invalid date — got "${raw.schedule_date}" (expected YYYY-MM-DD or MM/DD/YYYY)` } };
  }

  const roundedUrgency = Math.min(5, Math.max(1, Math.round(urgency)));

  return {
    ok: true,
    data: {
      sourceRow: rowIndex,
      schedule_date: scheduleDate,
      job_id: trimmedJobId,
      job_name: trimmedJobName,
      technician_name: trimmedTechName,
      revenue,
      duration_hours: duration,
      urgency: roundedUrgency,
    },
  };
}

export interface InsertJobsParams {
  rows: ValidJobRow[];
  companyId: string;
  db: DbClient;
  /** Resolves a technician display name to its DB UUID. */
  getTechnicianId: (name: string) => Promise<string>;
}

export interface InsertJobsResult {
  inserted: number;
  updated: number;
  failed: RowError[];
}

/**
 * Inserts or updates a batch of validated job rows into the database.
 * Existing key fallback is used because this schema does not store external job_id.
 */
export async function insertJobs({
  rows,
  companyId,
  db,
  getTechnicianId,
}: InsertJobsParams): Promise<InsertJobsResult> {
  let inserted = 0;
  let updated = 0;
  const failed: RowError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const techId = await getTechnicianId(row.technician_name);
      const payload = {
        company_id: companyId,
        technician_id: techId,
        job_date: row.schedule_date,
        revenue_estimate: row.revenue,
        duration_estimate_hours: row.duration_hours,
        urgency: row.urgency,
      };

      const { data: existing, error: findError } = await db
        .from("jobs")
        .select("id")
        .eq("company_id", companyId)
        .eq("technician_id", techId)
        .eq("job_date", row.schedule_date)
        .eq("revenue_estimate", row.revenue)
        .eq("duration_estimate_hours", row.duration_hours)
        .eq("urgency", row.urgency)
        .maybeSingle();

      if (findError) {
        failed.push({ row: row.sourceRow, message: findError.message });
        continue;
      }

      if (existing?.id) {
        const { error } = await db
          .from("jobs")
          .update(payload)
          .eq("id", existing.id);

        if (error) {
          failed.push({ row: row.sourceRow, message: error.message });
        } else {
          updated++;
        }
        continue;
      }

      const { error } = await db.from("jobs").insert(payload);

      if (error) {
        failed.push({ row: row.sourceRow, message: error.message });
      } else {
        inserted++;
      }
    } catch (err) {
      failed.push({
        row: row.sourceRow,
        message: err instanceof Error ? err.message : "Unknown insertion error",
      });
    }
  }

  return { inserted, updated, failed };
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
