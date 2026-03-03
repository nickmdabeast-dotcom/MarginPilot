/**
 * Optimizer diagnostics tests — verifies the optimizer produces
 * measurably better results on imbalanced workloads and preserves
 * data invariants.
 *
 * Run: npx tsx --test tests/optimizer-diagnostics.test.ts
 *
 * Uses Node.js built-in test runner — zero extra dependencies.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  optimizeJobs,
  computeDebugInfo,
  type JobInput,
} from "../lib/optimize.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<JobInput> & { id: string; technician_id: string }): JobInput {
  return {
    technician_name: "Tech",
    revenue_estimate: 100,
    duration_estimate_hours: 2,
    urgency: 3,
    ...overrides,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Fixture: Imbalanced (optimizer MUST improve) ────────────────────────────

const IMBALANCED_JOBS: JobInput[] = [
  // Alice: 6 jobs, 17h total — massively overloaded
  makeJob({ id: "J-001", technician_id: "t-alice", technician_name: "Alice", revenue_estimate: 4200, duration_estimate_hours: 5, urgency: 5 }),
  makeJob({ id: "J-002", technician_id: "t-alice", technician_name: "Alice", revenue_estimate: 3800, duration_estimate_hours: 4, urgency: 5 }),
  makeJob({ id: "J-003", technician_id: "t-alice", technician_name: "Alice", revenue_estimate: 1500, duration_estimate_hours: 2, urgency: 4 }),
  makeJob({ id: "J-004", technician_id: "t-alice", technician_name: "Alice", revenue_estimate: 800,  duration_estimate_hours: 1.5, urgency: 3 }),
  makeJob({ id: "J-007", technician_id: "t-alice", technician_name: "Alice", revenue_estimate: 950,  duration_estimate_hours: 1.5, urgency: 3 }),
  makeJob({ id: "J-008", technician_id: "t-alice", technician_name: "Alice", revenue_estimate: 2200, duration_estimate_hours: 3, urgency: 5 }),
  // Bob: 2 jobs, 1.5h — nearly idle
  makeJob({ id: "J-005", technician_id: "t-bob", technician_name: "Bob", revenue_estimate: 120, duration_estimate_hours: 0.5, urgency: 1 }),
  makeJob({ id: "J-009", technician_id: "t-bob", technician_name: "Bob", revenue_estimate: 200, duration_estimate_hours: 1, urgency: 2 }),
  // Carol: 2 jobs, 1.5h — nearly idle
  makeJob({ id: "J-006", technician_id: "t-carol", technician_name: "Carol", revenue_estimate: 180, duration_estimate_hours: 1, urgency: 1 }),
  makeJob({ id: "J-010", technician_id: "t-carol", technician_name: "Carol", revenue_estimate: 350, duration_estimate_hours: 0.5, urgency: 2 }),
];

// ── Fixture: Balanced (optimizer should NOT make things worse) ───────────────

const BALANCED_JOBS: JobInput[] = [
  // 3 techs × 3 identical jobs = perfect balance
  makeJob({ id: "J-101", technician_id: "t-alice", technician_name: "Alice", revenue_estimate: 500, duration_estimate_hours: 2, urgency: 3 }),
  makeJob({ id: "J-102", technician_id: "t-alice", technician_name: "Alice", revenue_estimate: 500, duration_estimate_hours: 2, urgency: 3 }),
  makeJob({ id: "J-103", technician_id: "t-alice", technician_name: "Alice", revenue_estimate: 500, duration_estimate_hours: 2, urgency: 3 }),
  makeJob({ id: "J-104", technician_id: "t-bob",   technician_name: "Bob",   revenue_estimate: 500, duration_estimate_hours: 2, urgency: 3 }),
  makeJob({ id: "J-105", technician_id: "t-bob",   technician_name: "Bob",   revenue_estimate: 500, duration_estimate_hours: 2, urgency: 3 }),
  makeJob({ id: "J-106", technician_id: "t-bob",   technician_name: "Bob",   revenue_estimate: 500, duration_estimate_hours: 2, urgency: 3 }),
  makeJob({ id: "J-107", technician_id: "t-carol", technician_name: "Carol", revenue_estimate: 500, duration_estimate_hours: 2, urgency: 3 }),
  makeJob({ id: "J-108", technician_id: "t-carol", technician_name: "Carol", revenue_estimate: 500, duration_estimate_hours: 2, urgency: 3 }),
  makeJob({ id: "J-109", technician_id: "t-carol", technician_name: "Carol", revenue_estimate: 500, duration_estimate_hours: 2, urgency: 3 }),
];

// ── Tests ────────────────────────────────────────────────────────────────────

describe("optimizer diagnostics — imbalanced fixture", () => {
  const result = optimizeJobs(IMBALANCED_JOBS);
  const debug = computeDebugInfo(IMBALANCED_JOBS, result.baseline, result.optimized);

  it("reassigns at least one job (changedCount > 0)", () => {
    assert.ok(debug.changed_count > 0, `expected changes, got ${debug.changed_count}`);
  });

  it("reduces workload variance", () => {
    assert.ok(
      result.optimized.workload_variance < result.baseline.workload_variance,
      `optimized variance (${result.optimized.workload_variance}) should be less than baseline (${result.baseline.workload_variance})`
    );
  });

  it("reduces or eliminates overtime", () => {
    assert.ok(
      result.optimized.overtime_tech_count <= result.baseline.overtime_tech_count,
      `optimized OT (${result.optimized.overtime_tech_count}) should be ≤ baseline OT (${result.baseline.overtime_tech_count})`
    );
  });

  it("revenue/hour score is preserved or improved", () => {
    assert.ok(
      debug.optimized_score >= debug.baseline_score,
      `optimized score (${debug.optimized_score}) should be ≥ baseline score (${debug.baseline_score})`
    );
  });

  it("preserves all invariants", () => {
    assert.ok(debug.invariants.no_duplicate_jobs, "optimized output has duplicate job IDs");
    assert.ok(debug.invariants.no_missing_jobs, "optimized output is missing jobs from input");
    assert.ok(debug.invariants.revenue_preserved, "total revenue changed during optimization");
    assert.ok(debug.invariants.duration_preserved, "total duration changed during optimization");
  });

  it("preserves total revenue exactly", () => {
    assert.equal(
      result.optimized.total_revenue,
      result.baseline.total_revenue,
      "total revenue must not change"
    );
  });

  it("all input jobs appear in output", () => {
    const outputIds = new Set(result.optimized.jobs.map((j) => j.id));
    for (const job of IMBALANCED_JOBS) {
      assert.ok(outputIds.has(job.id), `job ${job.id} missing from optimized output`);
    }
  });
});

describe("optimizer diagnostics — balanced fixture (control)", () => {
  const result = optimizeJobs(BALANCED_JOBS);
  const debug = computeDebugInfo(BALANCED_JOBS, result.baseline, result.optimized);

  it("workload variance does not increase", () => {
    assert.ok(
      result.optimized.workload_variance <= result.baseline.workload_variance,
      `optimized variance (${result.optimized.workload_variance}) should not exceed baseline (${result.baseline.workload_variance})`
    );
  });

  it("score does not decrease", () => {
    assert.ok(
      debug.optimized_score >= debug.baseline_score,
      `optimized score (${debug.optimized_score}) should be ≥ baseline score (${debug.baseline_score})`
    );
  });

  it("preserves all invariants", () => {
    assert.ok(debug.invariants.no_duplicate_jobs, "optimized output has duplicate job IDs");
    assert.ok(debug.invariants.no_missing_jobs, "optimized output is missing jobs from input");
    assert.ok(debug.invariants.revenue_preserved, "total revenue changed during optimization");
    assert.ok(debug.invariants.duration_preserved, "total duration changed during optimization");
  });

  it("all input jobs appear in output", () => {
    const outputIds = new Set(result.optimized.jobs.map((j) => j.id));
    for (const job of BALANCED_JOBS) {
      assert.ok(outputIds.has(job.id), `job ${job.id} missing from optimized output`);
    }
  });
});

describe("optimizer diagnostics — debug info computation", () => {
  it("correctly identifies changed assignments", () => {
    const jobs: JobInput[] = [
      makeJob({ id: "a", technician_id: "t1", technician_name: "Tech1", revenue_estimate: 1000, duration_estimate_hours: 5, urgency: 5 }),
      makeJob({ id: "b", technician_id: "t1", technician_name: "Tech1", revenue_estimate: 1000, duration_estimate_hours: 5, urgency: 5 }),
      makeJob({ id: "c", technician_id: "t2", technician_name: "Tech2", revenue_estimate: 100, duration_estimate_hours: 1, urgency: 1 }),
    ];
    const result = optimizeJobs(jobs);
    const debug = computeDebugInfo(jobs, result.baseline, result.optimized);

    // t1 has 10h of work, t2 has 1h — optimizer MUST move at least 1 job to t2
    assert.ok(debug.changed_count >= 1, `expected at least 1 change, got ${debug.changed_count}`);
    assert.ok(debug.changed_assignments.length > 0, "changed_assignments should have entries");
    assert.equal(typeof debug.changed_assignments[0].job_id, "string");
    assert.equal(typeof debug.changed_assignments[0].from_tech, "string");
    assert.equal(typeof debug.changed_assignments[0].to_tech, "string");
  });

  it("reports zero changes when input has single tech", () => {
    const jobs: JobInput[] = [
      makeJob({ id: "x", technician_id: "t1", technician_name: "Solo" }),
    ];
    const result = optimizeJobs(jobs);
    const debug = computeDebugInfo(jobs, result.baseline, result.optimized);
    assert.equal(debug.changed_count, 0);
  });
});
