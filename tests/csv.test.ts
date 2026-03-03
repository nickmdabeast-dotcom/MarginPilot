/**
 * Tests for CSV parsing (lib/csv.ts) and row validation (services/jobs.ts).
 *
 * Run: npx tsx --test tests/csv.test.ts
 *
 * Uses Node.js built-in test runner — zero extra dependencies.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeHeader,
  parseCSV,
  parseCSVRow,
  HEADER_ALIASES,
  REQUIRED_COLUMNS,
} from "../lib/csv.js";
import {
  validateJobRow,
  detectBatchCollisions,
  computeJobSignature,
  type ValidJobRow,
} from "../services/jobs.js";

// ── Header normalization ────────────────────────────────────────────────────

describe("normalizeHeader", () => {
  it("lowercases and replaces spaces/hyphens with underscores", () => {
    assert.equal(normalizeHeader("Duration Hours"), "duration_hours");
    assert.equal(normalizeHeader("Technician-Name"), "technician_name");
  });

  it("strips BOM and non-alphanumeric characters", () => {
    assert.equal(normalizeHeader("\uFEFFRevenue ($)"), "revenue");
    assert.equal(normalizeHeader("  Job ID!!! "), "job_id");
  });

  it("collapses repeated underscores", () => {
    assert.equal(normalizeHeader("tech__name"), "tech_name");
  });
});

// ── Header aliases → canonical keys ─────────────────────────────────────────

describe("HEADER_ALIASES", () => {
  it("maps common technician variants to technician_name", () => {
    for (const alias of ["tech", "employee", "worker", "staff"]) {
      assert.equal(
        HEADER_ALIASES[alias],
        "technician_name",
        `"${alias}" should map to technician_name`
      );
    }
  });

  it("maps revenue variants to revenue", () => {
    for (const alias of ["price", "amount", "total", "fee"]) {
      assert.equal(HEADER_ALIASES[alias], "revenue", `"${alias}" should map to revenue`);
    }
  });

  it("maps duration variants to duration_hours", () => {
    for (const alias of ["hours", "hrs", "duration", "labor_hours"]) {
      assert.equal(
        HEADER_ALIASES[alias],
        "duration_hours",
        `"${alias}" should map to duration_hours`
      );
    }
  });

  it("covers all REQUIRED_COLUMNS with at least one alias", () => {
    const targets = new Set(Object.values(HEADER_ALIASES));
    for (const col of REQUIRED_COLUMNS) {
      assert.ok(targets.has(col), `required column "${col}" must have at least one alias`);
    }
  });
});

// ── parseCSV full pipeline ──────────────────────────────────────────────────

describe("parseCSV", () => {
  const CSV_GOOD = [
    "Tech,Job ID,Job Name,Revenue,Duration Hours,Urgency,Schedule Date",
    "Alice,J-001,AC Install,$1500,2.5,high,2025-06-15",
    "Bob,J-002,Furnace Repair,$800,1.5,3,06/20/2025",
  ].join("\n");

  it("normalizes headers to canonical keys", () => {
    const result = parseCSV(CSV_GOOD);
    assert.deepEqual(result.headerCanonical, [
      "technician_name",
      "job_id",
      "job_name",
      "revenue",
      "duration_hours",
      "urgency",
      "schedule_date",
    ]);
  });

  it("parses two data rows", () => {
    const result = parseCSV(CSV_GOOD);
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0].technician_name, "Alice");
    assert.equal(result.rows[1].revenue, "$800");
  });

  it("reports zero missing columns for a complete CSV", () => {
    const result = parseCSV(CSV_GOOD);
    assert.deepEqual(result.missingColumns, []);
  });

  it("reports missing columns when headers are absent", () => {
    const partial = "Tech,Job ID\nAlice,J-001";
    const result = parseCSV(partial);
    assert.ok(result.missingColumns.includes("job_name"));
    assert.ok(result.missingColumns.includes("revenue"));
  });

  it("handles aliased headers (employee, price, priority)", () => {
    const csv = [
      "Employee,Job ID,Description,Price,Hours,Priority,Date",
      "Carol,J-003,Duct Clean,$200,1,low,2025-07-01",
    ].join("\n");
    const result = parseCSV(csv);
    assert.deepEqual(result.missingColumns, []);
    assert.equal(result.rows[0].technician_name, "Carol");
    assert.equal(result.rows[0].revenue, "$200");
    assert.equal(result.rows[0].urgency, "low");
  });

  it("detects semicolon delimiter", () => {
    const csv = "Tech;Job ID;Job Name;Revenue;Hours;Urgency;Date\nAlice;J1;Fix;100;2;3;2025-01-01";
    const result = parseCSV(csv);
    assert.equal(result.delimiter, ";");
    assert.equal(result.rows.length, 1);
  });

  it("handles empty/header-only input", () => {
    const result = parseCSV("Tech,Job ID");
    assert.equal(result.rows.length, 0);
  });
});

// ── parseCSVRow edge cases ──────────────────────────────────────────────────

describe("parseCSVRow", () => {
  it("handles quoted fields with commas", () => {
    const row = parseCSVRow('Alice,"$1,500",Install');
    assert.deepEqual(row, ["Alice", "$1,500", "Install"]);
  });

  it("handles escaped double-quotes inside fields", () => {
    const row = parseCSVRow('Alice,"Said ""hello""",Done');
    assert.deepEqual(row, ["Alice", 'Said "hello"', "Done"]);
  });
});

// ── validateJobRow ──────────────────────────────────────────────────────────

describe("validateJobRow", () => {
  const validRow = {
    technician_name: "Alice",
    job_id: "J-001",
    job_name: "AC Install",
    revenue: "$1,500.00",
    duration_hours: "2.5h",
    urgency: "high",
    schedule_date: "2025-06-15",
  };

  it("accepts a fully valid row and coerces values", () => {
    const result = validateJobRow(validRow, 2);
    assert.equal(result.ok, true);
    const data = (result as { ok: true; data: ValidJobRow }).data;
    assert.equal(data.technician_name, "Alice");
    assert.equal(data.revenue, 1500);
    assert.equal(data.duration_hours, 2.5);
    assert.equal(data.urgency, 5); // "high" → 5
    assert.equal(data.schedule_date, "2025-06-15");
  });

  it("accepts MM/DD/YYYY date format", () => {
    const row = { ...validRow, schedule_date: "06/15/2025" };
    const result = validateJobRow(row, 2);
    assert.equal(result.ok, true);
    assert.equal((result as { ok: true; data: ValidJobRow }).data.schedule_date, "2025-06-15");
  });

  it("accepts duration in minutes (150m)", () => {
    const row = { ...validRow, duration_hours: "150m" };
    const result = validateJobRow(row, 2);
    assert.equal(result.ok, true);
    assert.equal((result as { ok: true; data: ValidJobRow }).data.duration_hours, 2.5);
  });

  it("uses fallback date when schedule_date is empty", () => {
    const row = { ...validRow, schedule_date: "" };
    const result = validateJobRow(row, 2, "2025-01-01");
    assert.equal(result.ok, true);
    assert.equal((result as { ok: true; data: ValidJobRow }).data.schedule_date, "2025-01-01");
  });

  // ── Failure cases ──

  it("rejects missing technician_name with reason", () => {
    const row = { ...validRow, technician_name: "" };
    const result = validateJobRow(row, 3);
    assert.equal(result.ok, false);
    const err = (result as { ok: false; error: { row: number; message: string } }).error;
    assert.equal(err.row, 3);
    assert.match(err.message, /technician_name is required/);
  });

  it("rejects missing job_id with reason", () => {
    const row = { ...validRow, job_id: "  " };
    const result = validateJobRow(row, 4);
    assert.equal(result.ok, false);
    assert.match(
      (result as { ok: false; error: { row: number; message: string } }).error.message,
      /job_id is required/
    );
  });

  it("rejects invalid revenue with descriptive message", () => {
    const row = { ...validRow, revenue: "abc" };
    const result = validateJobRow(row, 5);
    assert.equal(result.ok, false);
    const msg = (result as { ok: false; error: { row: number; message: string } }).error.message;
    assert.match(msg, /invalid revenue/);
    assert.match(msg, /abc/); // includes the bad value
  });

  it("rejects zero duration", () => {
    const row = { ...validRow, duration_hours: "0" };
    const result = validateJobRow(row, 6);
    assert.equal(result.ok, false);
    assert.match(
      (result as { ok: false; error: { row: number; message: string } }).error.message,
      /invalid duration/
    );
  });

  it("rejects invalid urgency with descriptive message", () => {
    const row = { ...validRow, urgency: "super" };
    const result = validateJobRow(row, 7);
    assert.equal(result.ok, false);
    const msg = (result as { ok: false; error: { row: number; message: string } }).error.message;
    assert.match(msg, /invalid urgency/);
    assert.match(msg, /super/);
  });

  it("rejects bad date with descriptive message", () => {
    const row = { ...validRow, schedule_date: "not-a-date" };
    const result = validateJobRow(row, 8);
    assert.equal(result.ok, false);
    assert.match(
      (result as { ok: false; error: { row: number; message: string } }).error.message,
      /invalid date/
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6 New Test Fixtures — CSV pipeline hardening
// ═══════════════════════════════════════════════════════════════════════════════

// ── 1. CSV with BOM header ──────────────────────────────────────────────────

describe("parseCSV – BOM header", () => {
  it("strips UTF-8 BOM from the first header and parses correctly", () => {
    const csv = [
      "\uFEFFTech,Job ID,Job Name,Revenue,Duration Hours,Urgency,Schedule Date",
      "Alice,J-001,AC Install,1500,2.5,high,2025-06-15",
    ].join("\n");
    const result = parseCSV(csv);
    assert.deepEqual(result.missingColumns, []);
    assert.equal(result.headerCanonical[0], "technician_name");
    assert.equal(result.rows[0].technician_name, "Alice");
  });
});

// ── 2. CSV using semicolon delimiter ────────────────────────────────────────

describe("parseCSV – semicolon delimiter", () => {
  it("detects ; delimiter and parses all fields", () => {
    const csv = [
      "Tech;Job ID;Job Name;Revenue;Hours;Urgency;Date",
      "Bob;J-010;Pipe Fix;250;1.5;medium;2025-08-01",
      "Carol;J-011;Duct Clean;300;2;low;2025-08-02",
    ].join("\n");
    const result = parseCSV(csv);
    assert.equal(result.delimiter, ";");
    assert.equal(result.rows.length, 2);
    assert.deepEqual(result.missingColumns, []);
    assert.equal(result.rows[0].technician_name, "Bob");
    assert.equal(result.rows[1].revenue, "300");
  });
});

// ── 3. CSV with unquoted $1,500 revenue (realignment) ───────────────────────

describe("parseCSV – unquoted currency realignment", () => {
  it("realigns $1,500 without quotes and tracks the realignment", () => {
    const csv = [
      "Tech,Job ID,Job Name,Revenue,Duration Hours,Urgency,Schedule Date",
      "Alice,J-001,AC Install,$1,500,2.5,high,2025-06-15",
    ].join("\n");
    const result = parseCSV(csv);
    assert.equal(result.rows.length, 1);
    // Revenue should be the realigned "$1,500"
    assert.equal(result.rows[0].revenue, "$1,500");
    assert.equal(result.realignedRowCount, 1);
    assert.ok(result.realignedRowSamples.length > 0);
  });

  it("does NOT realign when extra columns are not currency-like", () => {
    // Extra comma in a non-currency field — should NOT trigger realignment
    const csv = [
      "Tech,Job ID,Job Name,Revenue,Duration Hours,Urgency,Schedule Date",
      "Alice,J-001,AC Install,500,2.5,high,2025-06-15,extra",
    ].join("\n");
    const result = parseCSV(csv);
    // Should still parse but NOT realign (no currency pattern match)
    assert.equal(result.realignedRowCount, 0);
  });
});

// ── 4. CSV missing urgency column ───────────────────────────────────────────

describe("parseCSV – missing urgency column", () => {
  it("reports urgency in missingColumns when header is absent", () => {
    const csv = [
      "Tech,Job ID,Job Name,Revenue,Duration Hours,Schedule Date",
      "Alice,J-001,AC Install,1500,2.5,2025-06-15",
    ].join("\n");
    const result = parseCSV(csv);
    assert.ok(
      result.missingColumns.includes("urgency"),
      `Expected missingColumns to include "urgency", got: ${JSON.stringify(result.missingColumns)}`
    );
  });
});

// ── 5. Duration in minutes (150m) ───────────────────────────────────────────

describe("validateJobRow – duration in minutes", () => {
  it("converts 150m to 2.5 hours", () => {
    const row = {
      technician_name: "Dave",
      job_id: "J-050",
      job_name: "HVAC Service",
      revenue: "500",
      duration_hours: "150m",
      urgency: "3",
      schedule_date: "2025-09-01",
    };
    const result = validateJobRow(row, 2);
    assert.equal(result.ok, true);
    assert.equal((result as { ok: true; data: ValidJobRow }).data.duration_hours, 2.5);
  });

  it("converts 90min to 1.5 hours", () => {
    const row = {
      technician_name: "Dave",
      job_id: "J-051",
      job_name: "Filter Replace",
      revenue: "200",
      duration_hours: "90min",
      urgency: "low",
      schedule_date: "2025-09-01",
    };
    const result = validateJobRow(row, 2);
    assert.equal(result.ok, true);
    assert.equal((result as { ok: true; data: ValidJobRow }).data.duration_hours, 1.5);
  });
});

// ── 6. Duplicate signatures within the same upload (skipped, not rejected) ──

describe("detectBatchCollisions", () => {
  const makeRow = (overrides: Partial<ValidJobRow> = {}): ValidJobRow => ({
    sourceRow: 2,
    schedule_date: "2025-06-15",
    job_id: "J-001",
    job_name: "AC Install",
    technician_name: "Alice",
    revenue: 1500,
    duration_hours: 2.5,
    urgency: 5,
    ...overrides,
  });

  it("identical duplicate rows: first processes, second is skipped", () => {
    const rows = [
      makeRow({ sourceRow: 2 }),
      makeRow({ sourceRow: 3 }), // same job_id → skipped
      makeRow({ sourceRow: 4, job_id: "J-999" }), // different job_id → unique
    ];
    const { unique, duplicates } = detectBatchCollisions(rows);
    assert.equal(unique.length, 2, "first occurrence + different row should be unique");
    assert.equal(duplicates.length, 1, "second identical row should be a duplicate");
    assert.equal(duplicates[0].row.sourceRow, 3, "duplicate should be the second occurrence");
    assert.equal(unique[0].sourceRow, 2);
  });

  it("duplicates should not appear in unique (i.e. not in 'failed')", () => {
    const rows = [
      makeRow({ sourceRow: 2 }),
      makeRow({ sourceRow: 3 }), // same job_id
      makeRow({ sourceRow: 4 }), // same job_id
    ];
    const { unique, duplicates } = detectBatchCollisions(rows);
    assert.equal(unique.length, 1);
    assert.equal(unique[0].sourceRow, 2);
    assert.equal(duplicates.length, 2);
    const dupRows = duplicates.map((d) => d.row.sourceRow);
    assert.ok(dupRows.includes(3));
    assert.ok(dupRows.includes(4));
  });

  it("totals add up: unique + duplicates = input length", () => {
    const rows = [
      makeRow({ sourceRow: 2 }),
      makeRow({ sourceRow: 3 }), // dup (same job_id)
      makeRow({ sourceRow: 4, job_id: "J-OTHER" }), // unique
      makeRow({ sourceRow: 5 }), // dup (same job_id as row 2)
      makeRow({ sourceRow: 6, job_id: "J-ANOTHER" }), // unique
    ];
    const { unique, duplicates } = detectBatchCollisions(rows);
    assert.equal(
      unique.length + duplicates.length,
      rows.length,
      "rows_valid + rows_skipped should equal total input rows"
    );
  });

  it("returns no duplicates when all signatures are unique", () => {
    const rows = [
      makeRow({ sourceRow: 2, job_id: "J-001" }),
      makeRow({ sourceRow: 3, job_id: "J-002" }),
    ];
    const { unique, duplicates } = detectBatchCollisions(rows);
    assert.equal(unique.length, 2);
    assert.equal(duplicates.length, 0);
  });

  it("produces consistent signatures via computeJobSignature (job_id mode)", () => {
    const row = makeRow();
    const r1 = computeJobSignature(row);
    const r2 = computeJobSignature({ ...row, technician_name: "  Alice  " });
    assert.equal(r1.signature, r2.signature, "Same job_id → same signature regardless of tech name");
    assert.equal(r1.mode, "job_id");
  });

  // ── Signature mode: job_id vs fallback ──

  it("same tech/date/revenue/duration/urgency but different job_id => not duplicate", () => {
    const rows = [
      makeRow({ sourceRow: 2, job_id: "J-001" }),
      makeRow({ sourceRow: 3, job_id: "J-002" }), // all other fields identical
    ];
    const { unique, duplicates, signature_mode_counts } = detectBatchCollisions(rows);
    assert.equal(unique.length, 2, "different job_ids should not collide");
    assert.equal(duplicates.length, 0);
    assert.equal(signature_mode_counts.job_id, 2);
    assert.equal(signature_mode_counts.fallback, 0);
  });

  it("same job_id appears twice => second is skipped", () => {
    const rows = [
      makeRow({ sourceRow: 2, job_id: "J-100", revenue: 500 }),
      makeRow({ sourceRow: 3, job_id: "J-100", revenue: 999 }), // same job_id, different revenue
    ];
    const { unique, duplicates, signature_mode_counts } = detectBatchCollisions(rows);
    assert.equal(unique.length, 1);
    assert.equal(duplicates.length, 1);
    assert.equal(duplicates[0].row.sourceRow, 3);
    assert.equal(signature_mode_counts.job_id, 2);
  });

  it("job_id missing => fallback signature behavior unchanged", () => {
    const rows = [
      makeRow({ sourceRow: 2, job_id: "" }),
      makeRow({ sourceRow: 3, job_id: "", revenue: 999 }), // different revenue → different fallback sig
      makeRow({ sourceRow: 4, job_id: "" }), // same fallback sig as row 2
    ];
    const { unique, duplicates, signature_mode_counts } = detectBatchCollisions(rows);
    assert.equal(unique.length, 2, "row 2 and row 3 are unique by fallback sig");
    assert.equal(duplicates.length, 1, "row 4 duplicates row 2");
    assert.equal(duplicates[0].row.sourceRow, 4);
    assert.equal(signature_mode_counts.fallback, 3);
    assert.equal(signature_mode_counts.job_id, 0);
  });

  it("job_id normalization: trimmed and lowercased, numeric treated as string", () => {
    const r1 = computeJobSignature(makeRow({ job_id: " J-001 " }));
    const r2 = computeJobSignature(makeRow({ job_id: "j-001" }));
    const r3 = computeJobSignature(makeRow({ job_id: "12345" }));
    assert.equal(r1.signature, r2.signature, "trim + lowercase should match");
    assert.equal(r1.mode, "job_id");
    assert.equal(r3.signature, "job_id::12345", "numeric job_id should remain string");
    assert.equal(r3.mode, "job_id");
  });
});

// ── Regression: duplicate job_id in same upload → skipped, not failed ────────

describe("detectBatchCollisions – duplicate job_id regression", () => {
  it("second row with same job_id is skipped (not failed); failed stays empty", () => {
    const rows: ValidJobRow[] = [
      {
        sourceRow: 2,
        schedule_date: "2025-06-15",
        job_id: "DUP-001",
        job_name: "AC Install",
        technician_name: "Alice",
        revenue: 1500,
        duration_hours: 2.5,
        urgency: 5,
      },
      {
        sourceRow: 3,
        schedule_date: "2025-06-15",
        job_id: "DUP-001",
        job_name: "Different Name",
        technician_name: "Bob",
        revenue: 999,
        duration_hours: 1,
        urgency: 2,
      },
    ];

    const { unique, duplicates, signature_mode_counts } = detectBatchCollisions(rows);

    // First row kept, second skipped
    assert.equal(unique.length, 1);
    assert.equal(unique[0].sourceRow, 2);

    // Second row appears in duplicates with the right reason
    assert.equal(duplicates.length, 1);
    assert.equal(duplicates[0].row.sourceRow, 3);
    assert.equal(duplicates[0].signature, "job_id::dup-001");

    // Signature mode
    assert.equal(signature_mode_counts.job_id, 2);
    assert.equal(signature_mode_counts.fallback, 0);
  });
});

// ── Alias traceability ──────────────────────────────────────────────────────

describe("parseCSV – alias traceability", () => {
  it("exposes aliasAppliedMap showing normalized → canonical mapping", () => {
    const csv = [
      "Employee,Ticket,Description,Price,Hours,Priority,Date",
      "Carol,J-003,Duct Clean,200,1,low,2025-07-01",
    ].join("\n");
    const result = parseCSV(csv);
    assert.equal(result.aliasAppliedMap["employee"], "technician_name");
    assert.equal(result.aliasAppliedMap["ticket"], "job_id");
    assert.equal(result.aliasAppliedMap["price"], "revenue");
    assert.equal(result.aliasAppliedMap["priority"], "urgency");
  });
});
