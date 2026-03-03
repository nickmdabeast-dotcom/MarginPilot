export interface ParsedRow {
  [key: string]: string;
}

// ─── Header normalization ─────────────────────────────────────────────────────

/**
 * Normalizes a raw CSV header to a canonical underscore_lowercase key:
 *  - removes UTF-8 BOM if present
 *  - trims whitespace
 *  - lowercases
 *  - replaces spaces and hyphens with underscores
 *  - strips everything that is not alphanumeric or underscore
 *  - collapses repeated underscores and strips leading/trailing underscores
 */
export function normalizeHeader(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "")       // strip UTF-8 BOM
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, "_")     // spaces/hyphens → _
    .replace(/[^\w]/g, "")        // drop anything not alphanumeric or _
    .replace(/_{2,}/g, "_")       // collapse double underscores
    .replace(/^_+|_+$/g, "");     // strip leading/trailing underscores
}

/**
 * Maps normalized header strings to the canonical internal field names used
 * by validateJobRow / insertJobs (the DB column names).
 *
 * Add entries here to support any new header alias a real CSV might have.
 */
export const HEADER_ALIASES: Record<string, string> = {
  // technician_name
  technician: "technician_name",
  tech: "technician_name",
  techname: "technician_name",
  technicianname: "technician_name",
  technician_name: "technician_name",
  employee: "technician_name",
  employee_name: "technician_name",
  worker: "technician_name",
  staff: "technician_name",
  name: "technician_name",

  // job_name
  job: "job_name",
  jobname: "job_name",
  job_name: "job_name",
  service: "job_name",
  description: "job_name",
  work_order: "job_name",
  title: "job_name",

  // job_id
  jobid: "job_id",
  job_id: "job_id",
  id: "job_id",
  external_id: "job_id",
  ticket: "job_id",
  ticket_id: "job_id",
  work_order_id: "job_id",

  // revenue
  revenue: "revenue",
  revenue_estimate: "revenue",
  price: "revenue",
  amount: "revenue",
  total: "revenue",
  charge: "revenue",
  cost: "revenue",
  fee: "revenue",
  value: "revenue",
  job_value: "revenue",

  // duration_hours / duration_minutes
  duration: "duration_hours",
  duration_hrs: "duration_hours",
  duration_hours: "duration_hours",
  durationhrs: "duration_hours",
  durationhours: "duration_hours",
  duration_estimate_hours: "duration_hours",
  hours: "duration_hours",
  hrs: "duration_hours",
  labor_hours: "duration_hours",
  labourhours: "duration_hours",
  est_hours: "duration_hours",
  duration_minutes: "duration_minutes",
  duration_mins: "duration_minutes",
  minutes: "duration_minutes",
  mins: "duration_minutes",

  // urgency
  urgency: "urgency",
  priority: "urgency",
  urgent: "urgency",
  level: "urgency",
  priority_level: "urgency",
  urgency_level: "urgency",
  importance: "urgency",

  // schedule_date
  date: "schedule_date",
  schedule_date: "schedule_date",
  scheduled_date: "schedule_date",
  scheduledate: "schedule_date",
  day: "schedule_date",
  service_date: "schedule_date",
  servicedate: "schedule_date",
  appointment_date: "schedule_date",
  work_date: "schedule_date",
  job_date: "schedule_date",
};

/** Canonical column names required in every upload row. */
export const REQUIRED_COLUMNS = [
  "technician_name",
  "job_id",
  "job_name",
  "revenue",
  "duration_hours",
  "urgency",
  "schedule_date",
] as const;

// ─── Delimiter detection ───────────────────────────────────────────────────────

function detectDelimiter(firstLine: string): "," | ";" | "\t" {
  if (firstLine.includes(";") && !firstLine.includes(",")) return ";";
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  if (semicolons > commas && semicolons >= tabs) return ";";
  if (tabs > commas) return "\t";
  return ",";
}

function hasRequiredColumn(
  required: (typeof REQUIRED_COLUMNS)[number],
  columns: Set<string>
): boolean {
  if (required === "duration_hours") {
    return columns.has("duration_hours") || columns.has("duration_minutes");
  }
  return columns.has(required);
}

// ─── Currency pattern for realignment guard ─────────────────────────────────

/** Matches currency-like values with thousands separators: $1,500 or 1,500.00 */
const CURRENCY_WITH_COMMAS = /^\$?\d{1,3}(,\d{3})+(\.\d+)?$/;

/**
 * Only realign values when:
 * 1. There is a column count mismatch (more values than headers)
 * 2. Values around the revenue column match a currency pattern
 */
function alignValuesToHeaders(
  values: string[],
  canonicalHeaders: string[],
  tracking: { realigned: boolean }
): string[] {
  if (values.length <= canonicalHeaders.length) return values;

  const revenueIdx = canonicalHeaders.indexOf("revenue");
  if (revenueIdx < 0) return values;

  // Guard: only realign when the joined candidate looks like currency with commas
  const aligned = [...values];
  let didRealign = false;

  while (aligned.length > canonicalHeaders.length && revenueIdx + 1 < aligned.length) {
    const candidate = `${aligned[revenueIdx]},${aligned[revenueIdx + 1]}`;
    if (!CURRENCY_WITH_COMMAS.test(candidate.replace(/^\$/, "").trim())) {
      // Not a currency pattern — stop realigning to avoid false positives
      break;
    }
    aligned[revenueIdx] = candidate;
    aligned.splice(revenueIdx + 1, 1);
    didRealign = true;
  }

  if (didRealign) {
    tracking.realigned = true;
  }

  return aligned;
}

// ─── Row parsing ───────────────────────────────────────────────────────────────

/**
 * Parses a single CSV line, respecting RFC 4180 quoted fields and escaped
 * double-quotes (`""`).
 */
export function parseCSVRow(line: string, delimiter = ","): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  fields.push(current.trim());
  return fields;
}

// ─── Full CSV parse ────────────────────────────────────────────────────────────

export interface CSVParseResult {
  rows: ParsedRow[];
  headerRaw: string[];
  headerNormalized: string[];
  headerCanonical: string[];
  /** Maps each normalized header to the canonical alias that was applied (or null if none). */
  aliasAppliedMap: Record<string, string | null>;
  delimiter: string;
  missingColumns: string[];
  /** Number of data rows where column realignment was applied. */
  realignedRowCount: number;
  /** Up to 3 sample row indices (1-based) where realignment occurred. */
  realignedRowSamples: number[];
}

/**
 * Parses a full CSV string into an array of header-keyed row objects.
 *
 * - Detects comma, semicolon, or tab delimiters automatically.
 * - Strips BOM and normalizes headers, then applies HEADER_ALIASES to map to
 *   canonical internal field names.
 * - Skips blank lines.
 * - Reports which required columns are absent.
 * - Tracks column realignment statistics.
 */
export function parseCSV(text: string): CSVParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return {
      rows: [],
      headerRaw: [],
      headerNormalized: [],
      headerCanonical: [],
      aliasAppliedMap: {},
      delimiter: ",",
      missingColumns: Array.from(REQUIRED_COLUMNS),
      realignedRowCount: 0,
      realignedRowSamples: [],
    };
  }

  const delimiter = detectDelimiter(lines[0]);
  const rawHeaders = parseCSVRow(lines[0], delimiter);
  const normalizedHeaders = rawHeaders.map(normalizeHeader);
  const canonicalHeaders = normalizedHeaders.map(
    (h) => HEADER_ALIASES[h] ?? h
  );

  // Build alias traceability map: normalized → canonical (null if no alias matched)
  const aliasAppliedMap: Record<string, string | null> = {};
  for (const h of normalizedHeaders) {
    aliasAppliedMap[h] = HEADER_ALIASES[h] ?? null;
  }

  // Identify which required columns are missing from the header
  const canonicalSet = new Set(canonicalHeaders);
  const missingColumns = REQUIRED_COLUMNS.filter((c) => !hasRequiredColumn(c, canonicalSet));

  // Track realignment
  let realignedRowCount = 0;
  const realignedRowSamples: number[] = [];

  const rows: ParsedRow[] = lines.slice(1).map((line, idx) => {
    const tracking = { realigned: false };
    const values = alignValuesToHeaders(parseCSVRow(line, delimiter), canonicalHeaders, tracking);
    if (tracking.realigned) {
      realignedRowCount++;
      if (realignedRowSamples.length < 3) {
        realignedRowSamples.push(idx + 2); // 1-based, header is row 1
      }
    }
    return Object.fromEntries(
      canonicalHeaders.map((h, i) => [h, values[i] ?? ""])
    );
  });

  return {
    rows,
    headerRaw: rawHeaders,
    headerNormalized: normalizedHeaders,
    headerCanonical: canonicalHeaders,
    aliasAppliedMap,
    delimiter,
    missingColumns,
    realignedRowCount,
    realignedRowSamples,
  };
}
