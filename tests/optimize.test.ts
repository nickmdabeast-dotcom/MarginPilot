/**
 * Targeted tests for lib/optimize.ts
 *
 * Run: npx tsx --test tests/optimize.test.ts
 *
 * Uses Node.js built-in test runner (node:test) — zero extra dependencies.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { optimizeJobs, computeDebugInfo, type JobInput } from "../lib/optimize.js";

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

// ── Tests ────────────────────────────────────────────────────────────────────

describe("optimizeJobs", () => {
  it("returns empty result for empty input", () => {
    const result = optimizeJobs([]);
    assert.equal(result.baseline.total_revenue, 0);
    assert.equal(result.optimized.total_revenue, 0);
    assert.equal(result.dispatch_plan.length, 0);
  });

  it("handles a single job / single technician", () => {
    const jobs: JobInput[] = [makeJob({ id: "j1", technician_id: "t1" })];
    const result = optimizeJobs(jobs);

    assert.equal(result.baseline.technicians.length, 1);
    assert.equal(result.optimized.technicians.length, 1);
    assert.equal(result.optimized.total_revenue, 100);
    assert.equal(result.dispatch_plan.length, 1);
    assert.equal(result.dispatch_plan[0].technician_id, "t1");
    assert.equal(result.dispatch_plan[0].jobs.length, 1);
  });

  it("does not crash when all technicians exceed overtime threshold", () => {
    // 2 techs, each with 5h of work already + this job pushes both over 8h
    // The optimizer starts fresh (slots at 0h) and assigns greedily, so we
    // need enough jobs to push all techs past 8h.
    const jobs: JobInput[] = [
      makeJob({ id: "j1", technician_id: "t1", duration_estimate_hours: 5 }),
      makeJob({ id: "j2", technician_id: "t1", duration_estimate_hours: 5 }),
      makeJob({ id: "j3", technician_id: "t2", duration_estimate_hours: 5 }),
      makeJob({ id: "j4", technician_id: "t2", duration_estimate_hours: 5 }),
      // This 5th job must be assigned to someone already at 10h
      makeJob({ id: "j5", technician_id: "t1", duration_estimate_hours: 5, revenue_estimate: 50 }),
    ];

    // Should NOT throw
    const result = optimizeJobs(jobs);

    assert.equal(result.optimized.technicians.length, 2);
    // All jobs should be assigned
    assert.equal(result.optimized.jobs.length, 5);
    // Total hours = 25 across 2 techs, both will exceed 8h
    const totalHours = result.optimized.technicians.reduce((s, t) => s + t.total_hours, 0);
    assert.equal(totalHours, 25);
    assert.ok(result.optimized.overtime_tech_count >= 1, "at least one tech should be in overtime");
  });

  it("balances workload across technicians", () => {
    // All jobs from one tech — optimizer should spread them
    const jobs: JobInput[] = [
      makeJob({ id: "j1", technician_id: "t1", duration_estimate_hours: 3, revenue_estimate: 300 }),
      makeJob({ id: "j2", technician_id: "t1", duration_estimate_hours: 3, revenue_estimate: 200 }),
      makeJob({ id: "j3", technician_id: "t2", duration_estimate_hours: 1, revenue_estimate: 50 }),
    ];

    const result = optimizeJobs(jobs);

    // Baseline: t1 has 6h, t2 has 1h — variance is high
    // Optimized: should be more balanced
    assert.ok(
      result.optimized.workload_variance <= result.baseline.workload_variance,
      "optimizer should reduce or maintain workload variance"
    );
  });

  it("produces valid dispatch_plan with sequential times", () => {
    const jobs: JobInput[] = [
      makeJob({ id: "j1", technician_id: "t1", duration_estimate_hours: 2 }),
      makeJob({ id: "j2", technician_id: "t1", duration_estimate_hours: 3 }),
    ];

    const result = optimizeJobs(jobs);
    const plan = result.dispatch_plan;

    for (const techPlan of plan) {
      for (let i = 0; i < techPlan.jobs.length; i++) {
        assert.equal(techPlan.jobs[i].order_index, i, "order_index should be sequential");
        assert.ok(
          techPlan.jobs[i].suggested_start.startsWith("1970-01-01T"),
          "suggested_start should use reference date"
        );
      }
    }
  });

  it("includes overtime simulation when labor cost is provided", () => {
    const jobs: JobInput[] = [
      makeJob({ id: "j1", technician_id: "t1", duration_estimate_hours: 10 }),
    ];

    const withoutCost = optimizeJobs(jobs);
    assert.equal(withoutCost.delta.simulation, null);

    const withCost = optimizeJobs(jobs, 50);
    assert.notEqual(withCost.delta.simulation, null);
    assert.equal(withCost.delta.simulation!.average_hourly_labor_cost, 50);
    assert.ok(withCost.delta.simulation!.overtime_hours_after > 0);
  });

  it("handles jobs with technician_id 'unassigned' (null tech from DB)", () => {
    // getJobsByDate maps null technician_id to "unassigned"
    const jobs: JobInput[] = [
      makeJob({ id: "j1", technician_id: "unassigned", technician_name: "Unknown" }),
      makeJob({ id: "j2", technician_id: "unassigned", technician_name: "Unknown" }),
    ];

    // Should not crash — creates a single slot with id "unassigned"
    const result = optimizeJobs(jobs);
    assert.equal(result.optimized.technicians.length, 1);
    assert.equal(result.optimized.jobs.length, 2);
  });
});

// ── computeDebugInfo before/after/delta metrics ─────────────────────────────

describe("computeDebugInfo – impact metrics", () => {
  it("populates before/after/delta for revenue_per_hour, overtime, and variance", () => {
    // Imbalanced baseline: t1 has 9h, t2 has 1h → optimizer should rebalance
    const jobs: JobInput[] = [
      makeJob({ id: "j1", technician_id: "t1", technician_name: "A", duration_estimate_hours: 5, revenue_estimate: 500 }),
      makeJob({ id: "j2", technician_id: "t1", technician_name: "A", duration_estimate_hours: 4, revenue_estimate: 400 }),
      makeJob({ id: "j3", technician_id: "t2", technician_name: "B", duration_estimate_hours: 1, revenue_estimate: 100 }),
    ];

    const result = optimizeJobs(jobs);
    const debug = computeDebugInfo(jobs, result.baseline, result.optimized);

    // Revenue totals must match (optimizer only reassigns, never drops jobs)
    assert.equal(debug.total_revenue_before, debug.total_revenue_after);

    // Before/after fields exist and are numbers
    assert.equal(typeof debug.revenue_per_hour_before, "number");
    assert.equal(typeof debug.revenue_per_hour_after, "number");
    assert.equal(typeof debug.revenue_per_hour_delta, "number");
    assert.equal(typeof debug.overtime_tech_count_before, "number");
    assert.equal(typeof debug.overtime_tech_count_after, "number");
    assert.equal(typeof debug.overtime_tech_count_delta, "number");
    assert.equal(typeof debug.workload_variance_before, "number");
    assert.equal(typeof debug.workload_variance_after, "number");
    assert.equal(typeof debug.workload_variance_delta, "number");

    // Delta = after - before
    assert.equal(
      debug.revenue_per_hour_delta,
      Math.round((debug.revenue_per_hour_after - debug.revenue_per_hour_before) * 100) / 100
    );
    assert.equal(
      debug.overtime_tech_count_delta,
      debug.overtime_tech_count_after - debug.overtime_tech_count_before
    );
    assert.equal(
      debug.workload_variance_delta,
      Math.round((debug.workload_variance_after - debug.workload_variance_before) * 100) / 100
    );

    // Baseline had t1 at 9h (OT) — optimizer should reduce or maintain OT
    assert.ok(debug.overtime_tech_count_before >= 1, "baseline should have at least 1 OT tech");
    assert.ok(debug.overtime_tech_count_after <= debug.overtime_tech_count_before, "optimizer should not increase OT");
  });

  it("returns zero deltas for a single-tech single-job scenario", () => {
    const jobs: JobInput[] = [
      makeJob({ id: "j1", technician_id: "t1", technician_name: "Solo" }),
    ];
    const result = optimizeJobs(jobs);
    const debug = computeDebugInfo(jobs, result.baseline, result.optimized);

    assert.equal(debug.revenue_per_hour_delta, 0);
    assert.equal(debug.overtime_tech_count_delta, 0);
    assert.equal(debug.workload_variance_delta, 0);
    assert.equal(debug.changed_count, 0);
  });
});
