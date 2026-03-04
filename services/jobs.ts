import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types";
import type { ParsedRow } from "@/lib/csv";
import type { JobInput } from "@/lib/optimize";
import { chunk } from "@/lib/utils";
import { createHash } from "crypto";

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

// ─── Signature collision detection ────────────────────────────────────────────

/**
 * Computes a composite signature string for a validated job row.
 *
 * Strategy:
 *  - If `job_id` is present (non-empty after trim), use `job_id::<normalized_job_id>|<schedule_date>`.
 *    Same job_id on different dates are treated as distinct jobs.
 *  - Otherwise fall back to the composite key:
 *    `technician_name|schedule_date|revenue|duration_hours|urgency`.
 *
 * Returns `{ signature, mode }` so callers can track which path was used.
 */
export function computeJobSignature(row: ValidJobRow): { signature: string; mode: "job_id" | "fallback" } {
  const trimmedJobId = row.job_id.trim();
  if (trimmedJobId.length > 0) {
    return {
      signature: `job_id::${trimmedJobId.toLowerCase()}|${row.schedule_date}`,
      mode: "job_id",
    };
  }
  return {
    signature: [
      row.technician_name.toLowerCase().trim(),
      row.schedule_date,
      row.revenue,
      row.duration_hours,
      row.urgency,
    ].join("|"),
    mode: "fallback",
  };
}

export interface CollisionResult {
  /** Rows that passed collision check (first occurrence of each signature). */
  unique: ValidJobRow[];
  /** Rows skipped as duplicates within the batch. */
  duplicates: Array<{ row: ValidJobRow; signature: string }>;
  /** How many rows used each signature mode. */
  signature_mode_counts: { job_id: number; fallback: number };
}

/**
 * Detects rows within the same upload batch that share an identical signature.
 * The first occurrence is kept; subsequent occurrences are flagged as duplicates.
 */
export function detectBatchCollisions(rows: ValidJobRow[]): CollisionResult {
  const seen = new Map<string, number>(); // signature → first sourceRow
  const unique: ValidJobRow[] = [];
  const duplicates: Array<{ row: ValidJobRow; signature: string }> = [];
  const signature_mode_counts = { job_id: 0, fallback: 0 };

  for (const row of rows) {
    const { signature: sig, mode } = computeJobSignature(row);
    signature_mode_counts[mode]++;
    if (seen.has(sig)) {
      duplicates.push({ row, signature: sig });
    } else {
      seen.set(sig, row.sourceRow);
      unique.push(row);
    }
  }

  return { unique, duplicates, signature_mode_counts };
}

// ─── Row hash for change detection ───────────────────────────────────────────

/**
 * Computes an MD5 hash of all mutable job fields.
 * Used to detect whether a re-uploaded row has actually changed.
 * The hash is stable: same normalized inputs always produce the same digest.
 */
export function computeRowHash(fields: {
  technician_id: string;
  job_date: string;
  revenue_estimate: number;
  duration_estimate_hours: number;
  urgency: number;
  job_name: string;
}): string {
  const input = [
    fields.technician_id,
    fields.job_date,
    fields.revenue_estimate,
    fields.duration_estimate_hours,
    fields.urgency,
    fields.job_name,
  ].join("|");
  return createHash("md5").update(input).digest("hex");
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

// ─── Bulk insert/update ───────────────────────────────────────────────────────

/** Max rows per INSERT batch. Tuned to balance round-trips vs payload size. */
export const BATCH_SIZE = 500;

export interface InsertJobsBulkParams {
  rows: ValidJobRow[];
  companyId: string;
  db: DbClient;
  /** Pre-resolved lowercase technician name → UUID map. */
  techMap: Map<string, string>;
}

export interface InsertJobsBulkResult {
  inserted: number;
  updated: number;
  /** Rows whose signature matched an existing job (all fields identical — no DB write needed). */
  unchanged: number;
  failed: RowError[];
  jobs_insert_batch_count: number;
  jobs_update_batch_count: number;
}

/**
 * Bulk-inserts or updates validated job rows using batched DB operations.
 *
 * Strategy:
 *   1. Resolve technician IDs from the pre-built map.
 *   2. Compute job_signature and row_hash for each row.
 *   3. Fetch existing jobs by signature to detect duplicates.
 *   4. Partition into inserts (new), updates (changed), unchanged (skip).
 *   5. Execute inserts and updates in batches of BATCH_SIZE.
 */
export async function insertJobsBulk({
  rows,
  companyId,
  db,
  techMap,
}: InsertJobsBulkParams): Promise<InsertJobsBulkResult> {
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  const failed: RowError[] = [];
  let insertBatchCount = 0;
  let updateBatchCount = 0;

  // 1. Build payloads with signature + hash, resolve tech IDs
  type JobPayload = {
    company_id: string;
    technician_id: string;
    job_date: string;
    revenue_estimate: number;
    duration_estimate_hours: number;
    urgency: number;
    job_name: string;
    external_job_id: string;
    job_signature: string;
    row_hash: string;
  };
  const payloads: Array<{ sourceRow: number; payload: JobPayload }> = [];

  for (const row of rows) {
    const techId = techMap.get(row.technician_name.toLowerCase().trim());
    if (!techId) {
      failed.push({
        row: row.sourceRow,
        message: `Technician "${row.technician_name}" could not be resolved`,
      });
      continue;
    }

    const { signature } = computeJobSignature(row);
    const hash = computeRowHash({
      technician_id: techId,
      job_date: row.schedule_date,
      revenue_estimate: row.revenue,
      duration_estimate_hours: row.duration_hours,
      urgency: row.urgency,
      job_name: row.job_name,
    });

    payloads.push({
      sourceRow: row.sourceRow,
      payload: {
        company_id: companyId,
        technician_id: techId,
        job_date: row.schedule_date,
        revenue_estimate: row.revenue,
        duration_estimate_hours: row.duration_hours,
        urgency: row.urgency,
        job_name: row.job_name,
        external_job_id: row.job_id,
        job_signature: signature,
        row_hash: hash,
      },
    });
  }

  // 2. Fetch existing jobs by signature for change detection
  const allSignatures = payloads.map((p) => p.payload.job_signature);
  const existingSigMap = new Map<string, { id: string; row_hash: string | null }>();

  for (const sigChunk of chunk(allSignatures, 500)) {
    const { data, error } = await db
      .from("jobs")
      .select("id, job_signature, row_hash")
      .eq("company_id", companyId)
      .in("job_signature", sigChunk);

    if (error) {
      // Non-fatal: fall back to treating all as inserts
      break;
    }
    if (data) {
      for (const row of data) {
        if (row.job_signature) {
          existingSigMap.set(row.job_signature, { id: row.id, row_hash: row.row_hash });
        }
      }
    }
  }

  // 3. Partition into inserts, updates, unchanged
  const toInsert: Array<{ sourceRow: number; payload: JobPayload }> = [];
  const toUpdate: Array<{ sourceRow: number; existingId: string; payload: JobPayload }> = [];

  for (const item of payloads) {
    const existing = existingSigMap.get(item.payload.job_signature);

    if (!existing) {
      // New row — INSERT
      toInsert.push(item);
    } else if (existing.row_hash !== item.payload.row_hash) {
      // Signature matches but content changed — UPDATE
      toUpdate.push({ sourceRow: item.sourceRow, existingId: existing.id, payload: item.payload });
    } else {
      // Signature + hash match — skip
      unchanged++;
    }
  }

  // 4. Batched inserts
  for (const batch of chunk(toInsert, BATCH_SIZE)) {
    insertBatchCount++;
    const { data, error } = await db
      .from("jobs")
      .insert(batch.map((b) => b.payload))
      .select("id");

    if (error) {
      // If batch insert fails, try individual inserts as fallback
      for (const item of batch) {
        const { error: singleErr } = await db.from("jobs").insert(item.payload);
        if (singleErr) {
          failed.push({ row: item.sourceRow, message: singleErr.message });
        } else {
          inserted++;
        }
      }
    } else {
      inserted += data?.length ?? batch.length;
    }
  }

  // 5. Batched updates (individual UPDATE per row — safe for varying payloads)
  for (const batch of chunk(toUpdate, BATCH_SIZE)) {
    updateBatchCount++;
    for (const item of batch) {
      const { company_id: _cid, job_signature: _sig, ...updateFields } = item.payload;
      const { error } = await db
        .from("jobs")
        .update(updateFields)
        .eq("id", item.existingId);

      if (error) {
        failed.push({ row: item.sourceRow, message: error.message });
      } else {
        updated++;
      }
    }
  }

  return {
    inserted,
    updated,
    unchanged,
    failed,
    jobs_insert_batch_count: insertBatchCount,
    jobs_update_batch_count: updateBatchCount,
  };
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
