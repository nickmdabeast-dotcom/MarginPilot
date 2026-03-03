import { NextRequest, NextResponse } from "next/server";
import { isAuthError } from "@/lib/auth";
import { getApiContext } from "@/lib/apiContext";
import { parseCSV, REQUIRED_COLUMNS, HEADER_ALIASES } from "@/lib/csv";
import { validateJobRow, insertJobsBulk, detectBatchCollisions, type ValidJobRow } from "@/services/jobs";
import { bulkResolveTechnicians } from "@/services/technicians";

export const dynamic = "force-dynamic";

const DEBUG_CSV_UPLOAD =
  process.env.DEBUG_CSV_UPLOAD === "1" || process.env.DEBUG?.includes("csv-upload");

function sanitizeValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 80) return trimmed;
  return `${trimmed.slice(0, 77)}...`;
}

function sanitizeRow(row: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, sanitizeValue(String(value ?? ""))])
  );
}

function debugLog(label: string, payload: unknown) {
  if (!DEBUG_CSV_UPLOAD) return;
  console.log(`[csv-upload] ${label}`, payload);
}

// ─── POST /api/jobs/upload ────────────────────────────────────────────────────
// Body: multipart/form-data
//   file       — CSV file (required)
//   date       — YYYY-MM-DD fallback when CSV rows lack a date column (optional)
//
// Success:  { success: true, inserted: number, updated: number, rejectedRows: RowError[] }
// Failure:  { success: false, error: string, details?: UploadErrorDetails }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  // 0. Require auth + company context first
  let db: Awaited<ReturnType<typeof getApiContext>>["db"];
  let companyId: string;
  try {
    const ctx = await getApiContext();
    db = ctx.db;
    companyId = ctx.companyId;
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.status }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Database configuration error",
      },
      { status: 500 }
    );
  }

  // 1. Parse multipart form
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: "Could not parse form data" },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  const fallbackDate = formData.get("date");

  if (!file || typeof file === "string") {
    return NextResponse.json(
      { success: false, error: "file is required (multipart field)" },
      { status: 400 }
    );
  }

  // 2. Read CSV text
  let csvText: string;
  try {
    csvText = await (file as File).text();
  } catch {
    return NextResponse.json(
      { success: false, error: "Could not read file contents" },
      { status: 400 }
    );
  }

  if (!csvText.trim()) {
    return NextResponse.json(
      { success: false, error: "Uploaded file is empty" },
      { status: 400 }
    );
  }

  // ─── Timing instrumentation ──────────────────────────────────────────────
  const timings: Record<string, number> = {};
  const tick = (label: string, start: number) => {
    timings[label] = Math.round(performance.now() - start);
  };

  // 3. Parse CSV (includes header normalization + alias mapping)
  const tParse = performance.now();
  const {
    rows, headerRaw, headerNormalized, headerCanonical,
    aliasAppliedMap, missingColumns, realignedRowCount, realignedRowSamples,
  } = parseCSV(csvText);
  tick("parse_normalize_ms", tParse);
  debugLog("headers", {
    raw: headerRaw,
    normalized: headerNormalized,
    canonical: headerCanonical,
    aliasAppliedMap,
  });
  debugLog("parsedRowCount", rows.length);
  debugLog("sampleRows", rows.slice(0, 3).map((row) => sanitizeRow(row)));

  // Build header_map: normalized header → canonical field name (null if unrecognized)
  const headerMap: Record<string, string | null> = {};
  for (const h of headerNormalized) {
    headerMap[h] = HEADER_ALIASES[h] ?? null;
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { success: false, error: "CSV has no data rows (only header or empty)" },
      { status: 400 }
    );
  }

  // 3b. Validate the fallback date (from date picker) if supplied
  const dateFallback =
    typeof fallbackDate === "string" && DATE_RE.test(fallbackDate.trim())
      ? fallbackDate.trim()
      : undefined;

  // 4. Fail fast if required columns are structurally absent.
  //    When a valid fallback date is provided via the date picker, job_date is
  //    no longer structurally required — per-row validation will use the fallback.
  const effectiveMissing = dateFallback
    ? missingColumns.filter((c) => c !== "schedule_date")
    : missingColumns;

  if (effectiveMissing.length > 0) {
    return NextResponse.json(
      {
        success: false,
        error: "CSV is missing required columns",
        details: {
          // backward-compat fields
          parsedRowCount: rows.length,
          headerRaw,
          headerNormalized,
          headerCanonical,
          requiredColumns: Array.from(REQUIRED_COLUMNS),
          missingColumns: effectiveMissing,
          sampleRejections: [],
          // new diagnostic fields
          headers_raw: headerRaw,
          headers_normalized: headerNormalized,
          alias_applied_map: aliasAppliedMap,
          header_map: headerMap,
          final_mapped_headers: headerCanonical,
          rows_total: rows.length,
          rows_valid: 0,
          rows_rejected: rows.length,
          rejection_reasons_summary: {
            [`missing_columns:${effectiveMissing.join(",")}`]: rows.length,
          },
          rejected_rows_sample: [],
          realigned_row_count: realignedRowCount,
          realigned_row_samples: realignedRowSamples,
          duplicate_signature_count: 0,
          rows_skipped: 0,
          skipped_reasons_summary: {},
        },
      },
      { status: 400 }
    );
  }

  // 5. Validate each row
  const tValidate = performance.now();
  const validRows: ValidJobRow[] = [];
  const parseErrors: Array<{ row: number; reason: string }> = [];
  const rejectedRowSamples: Array<{ row_index: number; reasons: string[]; data: Record<string, string> }> = [];

  for (let i = 0; i < rows.length; i++) {
    const result = validateJobRow(rows[i], i + 2, dateFallback); // +2: header is row 1
    if (result.ok) {
      validRows.push(result.data);
    } else {
      parseErrors.push({ row: result.error.row, reason: result.error.message });
      debugLog("rowRejected", { row: result.error.row, reason: result.error.message });
      if (rejectedRowSamples.length < 10) {
        rejectedRowSamples.push({
          row_index: result.error.row,
          reasons: [result.error.message],
          data: sanitizeRow(rows[i]),
        });
      }
    }
  }
  tick("validate_ms", tValidate);

  // Compute rejection reasons summary
  const rejectionReasonsSummary: Record<string, number> = {};
  for (const e of parseErrors) {
    rejectionReasonsSummary[e.reason] = (rejectionReasonsSummary[e.reason] ?? 0) + 1;
  }

  if (validRows.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: "No valid rows found in CSV",
        details: {
          // backward-compat fields
          parsedRowCount: rows.length,
          headerRaw,
          headerNormalized,
          headerCanonical,
          requiredColumns: Array.from(REQUIRED_COLUMNS),
          missingColumns,
          sampleRejections: parseErrors.slice(0, 10),
          // new diagnostic fields
          headers_raw: headerRaw,
          headers_normalized: headerNormalized,
          alias_applied_map: aliasAppliedMap,
          header_map: headerMap,
          final_mapped_headers: headerCanonical,
          rows_total: rows.length,
          rows_valid: 0,
          rows_rejected: parseErrors.length,
          rejection_reasons_summary: rejectionReasonsSummary,
          rejected_rows_sample: rejectedRowSamples,
          realigned_row_count: realignedRowCount,
          realigned_row_samples: realignedRowSamples,
          duplicate_signature_count: 0,
          rows_skipped: 0,
          skipped_reasons_summary: {},
        },
      },
      { status: 400 }
    );
  }

  // 5b. Detect signature collisions within the upload batch
  //     Duplicates are SKIPPED (not rejected) — they are valid rows that are
  //     redundant within the same upload.
  const tCollision = performance.now();
  const { unique: nonDuplicateRows, duplicates, signature_mode_counts } = detectBatchCollisions(validRows);
  tick("collision_detect_ms", tCollision);

  const skipped: Array<{ row: number; message: string }> = [];
  const skippedReasonsSummary: Record<string, number> = {};

  for (const dup of duplicates) {
    const reason = "duplicate_signature_in_upload";
    skipped.push({ row: dup.row.sourceRow, message: reason });
    skippedReasonsSummary[reason] = (skippedReasonsSummary[reason] ?? 0) + 1;
  }

  if (nonDuplicateRows.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: "No unique rows to process after skipping duplicates",
        skipped,
        details: {
          parsedRowCount: rows.length,
          headerRaw,
          headerNormalized,
          headerCanonical,
          requiredColumns: Array.from(REQUIRED_COLUMNS),
          missingColumns,
          sampleRejections: parseErrors.slice(0, 10),
          headers_raw: headerRaw,
          headers_normalized: headerNormalized,
          alias_applied_map: aliasAppliedMap,
          header_map: headerMap,
          final_mapped_headers: headerCanonical,
          rows_total: rows.length,
          rows_valid: 0,
          rows_rejected: parseErrors.length,
          rows_skipped: skipped.length,
          rejection_reasons_summary: rejectionReasonsSummary,
          skipped_reasons_summary: skippedReasonsSummary,
          rejected_rows_sample: rejectedRowSamples,
          realigned_row_count: realignedRowCount,
          realigned_row_samples: realignedRowSamples,
          duplicate_signature_count: duplicates.length,
          signature_mode_counts,
        },
      },
      { status: 400 }
    );
  }

  // 6. Bulk-resolve technicians (1-2 queries instead of N)
  const tTech = performance.now();
  const uniqueTechNames = [...new Set(nonDuplicateRows.map((r) => r.technician_name))];
  const techResult = await bulkResolveTechnicians(uniqueTechNames, companyId, db);
  tick("technician_resolve_ms", tTech);

  // 7. Bulk insert/update jobs (batched)
  const tUpsert = performance.now();
  const result = await insertJobsBulk({
    rows: nonDuplicateRows,
    companyId,
    db,
    techMap: techResult.map,
  });
  tick("db_upsert_ms", tUpsert);

  const elapsed = Math.round(performance.now() - tParse);

  // Merge parse errors + insert errors for the response (duplicates are NOT included)
  const allFailed = [
    ...parseErrors.map((e) => ({ row: e.row, message: e.reason })),
    ...result.failed,
  ];

  const warnings: string[] = [];
  if (allFailed.length > 0) {
    warnings.push(`${allFailed.length} row(s) failed validation — see "failed" for details`);
  }
  if (skipped.length > 0) {
    warnings.push(`${skipped.length} duplicate row(s) skipped within this upload`);
  }

  return NextResponse.json(
    {
      success: true,
      inserted: result.inserted,
      updated: result.updated,
      unchanged: result.unchanged,
      rejectedRows: allFailed,
      failed: allFailed,
      skipped,
      warnings,
      diagnostics: {
        headers_raw: headerRaw,
        headers_normalized: headerNormalized,
        alias_applied_map: aliasAppliedMap,
        header_map: headerMap,
        final_mapped_headers: headerCanonical,
        rows_total: rows.length,
        rows_valid: nonDuplicateRows.length,
        rows_rejected: parseErrors.length,
        rows_skipped: skipped.length,
        rejection_reasons_summary: rejectionReasonsSummary,
        skipped_reasons_summary: skippedReasonsSummary,
        rejected_rows_sample: rejectedRowSamples,
        realigned_row_count: realignedRowCount,
        realigned_row_samples: realignedRowSamples,
        duplicate_signature_count: duplicates.length,
        signature_mode_counts,
        technician_resolved_count: techResult.resolved_count,
        technician_created_count: techResult.created_count,
        jobs_insert_batch_count: result.jobs_insert_batch_count,
        jobs_update_batch_count: result.jobs_update_batch_count,
        matched_existing_count: result.unchanged,
        rows_unchanged: result.unchanged,
        elapsed_ms_total: elapsed,
        timings,
      },
    },
    { status: 200 }
  );
}
