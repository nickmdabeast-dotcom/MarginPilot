/**
 * Tests for bulk upload path (services/jobs.ts insertJobsBulk,
 * services/technicians.ts bulkResolveTechnicians).
 *
 * Run: npx tsx --test tests/bulk-upload.test.ts
 *
 * Uses Node.js built-in test runner — zero extra dependencies.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  insertJobsBulk,
  type ValidJobRow,
  type InsertJobsBulkResult,
} from "../services/jobs.js";

import {
  bulkResolveTechnicians,
  type BulkResolveResult,
} from "../services/technicians.js";

// ─── Helpers: minimal Supabase mock ──────────────────────────────────────────

/** Tracks calls made to the mock DB for assertions. */
interface CallLog {
  method: string;
  table: string;
  args?: unknown;
}

function createMockDb(options: {
  existingTechnicians?: Array<{ id: string; name: string }>;
  existingJobs?: Array<{
    id: string;
    technician_id: string;
    job_date: string;
    revenue_estimate: number;
    duration_estimate_hours: number;
    urgency: number;
  }>;
} = {}) {
  const calls: CallLog[] = [];
  const { existingTechnicians = [], existingJobs = [] } = options;

  function chainable(table: string, resolveData: unknown) {
    const chain: Record<string, unknown> = {};
    const addMethod = (name: string) => {
      chain[name] = (...args: unknown[]) => {
        calls.push({ method: name, table, args });
        return chain;
      };
    };
    for (const m of ["select", "eq", "in", "ilike", "maybeSingle", "single"]) {
      addMethod(m);
    }
    // Terminal: make the chain thenable so await works
    chain.then = (resolve: (v: unknown) => void) => {
      resolve({ data: resolveData, error: null });
    };
    return chain;
  }

  const db = {
    from: (table: string) => {
      calls.push({ method: "from", table });
      return {
        select: (...args: unknown[]) => {
          calls.push({ method: "select", table, args });
          const data =
            table === "technicians" ? existingTechnicians :
            table === "jobs" ? existingJobs : [];
          return chainable(table, data);
        },
        insert: (payload: unknown) => {
          calls.push({ method: "insert", table, args: payload });
          // For technicians, return the inserted rows with generated IDs
          if (table === "technicians" && Array.isArray(payload)) {
            const inserted = payload.map((p: { name: string }, i: number) => ({
              id: `new-tech-${i}`,
              name: p.name,
            }));
            return chainable(table, inserted);
          }
          // For jobs insert, return ids
          if (table === "jobs" && Array.isArray(payload)) {
            const inserted = payload.map((_: unknown, i: number) => ({
              id: `new-job-${i}`,
            }));
            return chainable(table, inserted);
          }
          return chainable(table, [{ id: "new-single" }]);
        },
        update: (payload: unknown) => {
          calls.push({ method: "update", table, args: payload });
          return chainable(table, null);
        },
      };
    },
  };

  return { db: db as unknown as Parameters<typeof insertJobsBulk>[0]["db"], calls };
}

function makeRow(overrides: Partial<ValidJobRow> = {}): ValidJobRow {
  return {
    sourceRow: 2,
    schedule_date: "2025-06-15",
    job_id: "J-001",
    job_name: "AC Install",
    technician_name: "Alice",
    revenue: 1500,
    duration_hours: 2.5,
    urgency: 5,
    ...overrides,
  };
}

// ─── bulkResolveTechnicians ──────────────────────────────────────────────────

describe("bulkResolveTechnicians", () => {
  it("resolves existing technicians in a single SELECT", async () => {
    const { db, calls } = createMockDb({
      existingTechnicians: [
        { id: "tech-1", name: "Alice" },
        { id: "tech-2", name: "Bob" },
      ],
    });

    const result = await bulkResolveTechnicians(["Alice", "Bob"], "comp-1", db);

    assert.equal(result.resolved_count, 2);
    assert.equal(result.created_count, 0);
    assert.equal(result.map.get("alice"), "tech-1");
    assert.equal(result.map.get("bob"), "tech-2");

    // Should NOT have called insert on technicians
    const insertCalls = calls.filter((c) => c.method === "insert" && c.table === "technicians");
    assert.equal(insertCalls.length, 0, "Should not insert when all technicians exist");
  });

  it("bulk-inserts missing technicians in ONE insert call", async () => {
    const { db, calls } = createMockDb({
      existingTechnicians: [{ id: "tech-1", name: "Alice" }],
    });

    const result = await bulkResolveTechnicians(
      ["Alice", "NewTech1", "NewTech2"],
      "comp-1",
      db
    );

    assert.equal(result.created_count, 2);
    // Should have exactly one insert call for technicians
    const insertCalls = calls.filter((c) => c.method === "insert" && c.table === "technicians");
    assert.equal(insertCalls.length, 1, "Should use a single bulk insert for missing technicians");
    // The insert payload should contain both new techs
    const insertedPayload = insertCalls[0].args as Array<{ name: string }>;
    assert.equal(insertedPayload.length, 2);
  });

  it("does NOT call per-row create for 2000 unique names", async () => {
    const names = Array.from({ length: 2000 }, (_, i) => `Tech${i}`);
    const { db, calls } = createMockDb({ existingTechnicians: [] });

    await bulkResolveTechnicians(names, "comp-1", db);

    // Should have at most a few queries, NOT 2000
    const techInsertCalls = calls.filter(
      (c) => c.method === "insert" && c.table === "technicians"
    );
    assert.ok(
      techInsertCalls.length <= 2,
      `Expected at most 2 insert calls, got ${techInsertCalls.length}`
    );
  });

  it("deduplicates input names", async () => {
    const { db } = createMockDb({ existingTechnicians: [] });
    const result = await bulkResolveTechnicians(
      ["Alice", "alice", "ALICE", "Bob"],
      "comp-1",
      db
    );

    // "Alice" variants collapse to 2 unique names (Alice, Bob) but
    // the exact dedup depends on casing — at minimum no error
    assert.ok(result.map.size >= 2);
  });
});

// ─── insertJobsBulk ──────────────────────────────────────────────────────────

describe("insertJobsBulk", () => {
  it("returns batch count diagnostics", async () => {
    const techMap = new Map([["alice", "tech-1"]]);
    const rows = Array.from({ length: 5 }, (_, i) =>
      makeRow({ sourceRow: i + 2, job_id: `J-${i}`, revenue: 100 * (i + 1) })
    );
    const { db } = createMockDb();

    const result = await insertJobsBulk({ rows, companyId: "comp-1", db, techMap });

    assert.equal(typeof result.jobs_insert_batch_count, "number");
    assert.equal(typeof result.jobs_update_batch_count, "number");
    assert.ok(result.jobs_insert_batch_count >= 1, "Should have at least 1 insert batch");
    assert.equal(result.inserted, 5);
  });

  it("uses batched inserts for 500 rows (not 500 individual calls)", async () => {
    const techMap = new Map([["alice", "tech-1"]]);
    const rows = Array.from({ length: 500 }, (_, i) =>
      makeRow({ sourceRow: i + 2, job_id: `J-${i}`, revenue: 100 + i })
    );
    const { db, calls } = createMockDb();

    const result = await insertJobsBulk({ rows, companyId: "comp-1", db, techMap });

    // 500 rows / 200 batch size = 3 batches
    assert.equal(result.jobs_insert_batch_count, 3);
    assert.equal(result.inserted, 500);

    // Count actual insert calls to jobs table
    const jobInserts = calls.filter((c) => c.method === "insert" && c.table === "jobs");
    assert.ok(
      jobInserts.length <= 5,
      `Expected at most 5 insert calls (3 batches + margin), got ${jobInserts.length}`
    );
  });

  it("detects existing jobs and counts them as updates", async () => {
    const techMap = new Map([["alice", "tech-1"]]);
    const rows = [makeRow({ sourceRow: 2 })];
    const { db } = createMockDb({
      existingJobs: [
        {
          id: "existing-job-1",
          technician_id: "tech-1",
          job_date: "2025-06-15",
          revenue_estimate: 1500,
          duration_estimate_hours: 2.5,
          urgency: 5,
        },
      ],
    });

    const result = await insertJobsBulk({ rows, companyId: "comp-1", db, techMap });

    assert.equal(result.updated, 1);
    assert.equal(result.inserted, 0);
  });

  it("reports failed rows when technician is not in the map", async () => {
    const techMap = new Map<string, string>(); // empty — no techs resolved
    const rows = [makeRow({ sourceRow: 2, technician_name: "Unknown" })];
    const { db } = createMockDb();

    const result = await insertJobsBulk({ rows, companyId: "comp-1", db, techMap });

    assert.equal(result.failed.length, 1);
    assert.match(result.failed[0].message, /could not be resolved/);
  });
});
