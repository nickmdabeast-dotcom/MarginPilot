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
import { validateJobRow, type ValidJobRow } from "../services/jobs.js";

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
