// ── Types ─────────────────────────────────────────────────────────────────────

export interface JobInput {
  id: string;
  technician_id: string;
  technician_name: string;
  revenue_estimate: number;
  duration_estimate_hours: number;
  urgency: number; // integer 1–5
}

export interface ScoredJob extends JobInput {
  score: number;
}

export interface TechnicianResult {
  id: string;
  name: string;
  revenue: number;
  total_hours: number;
  revenue_per_hour: number;
  overtime_flag: boolean; // true when total_hours > 8
}

export interface ScheduleSnapshot {
  total_revenue: number;
  revenue_per_hour: number;
  overtime_tech_count: number;
  workload_variance: number;
  capacity_utilization_rate: number; // total_hours / (num_techs * 8)
  technicians: TechnicianResult[];
  jobs: ScoredJob[];
}

export interface OptimizationDelta {
  revenue_per_hour_change: number;        // optimized − baseline
  overtime_reduction: number;             // baseline OT count − optimized OT count
  workload_balance_improvement: number;   // baseline variance − optimized variance
  /**
   * SIMULATION — projected overtime labour cost impact.
   * Assumes 1.5× wage rate for all hours exceeding the 8-hour threshold.
   * null when average_hourly_labor_cost is not supplied.
   */
  simulation: OvertimeSimulation | null;
}

/**
 * SIMULATION — not actual costs. Projection based on caller-supplied
 * average_hourly_labor_cost and a fixed 1.5× overtime rate multiplier.
 */
export interface OvertimeSimulation {
  average_hourly_labor_cost: number;  // input assumption ($/hr)
  overtime_hours_before: number;      // total OT hours across all techs in baseline
  overtime_hours_after: number;       // total OT hours across all techs in optimized
  overtime_cost_before: number;       // overtime_hours_before × rate × 1.5
  overtime_cost_after: number;        // overtime_hours_after × rate × 1.5
  estimated_margin_improvement: number; // cost_before − cost_after
}

export interface Diagnostics {
  underutilized_count: number;        // technicians with < 5 assigned hours
  overloaded_count: number;           // technicians with > 9 assigned hours
  revenue_concentration_ratio: number; // max tech revenue / min tech revenue (0 = undefined)
  idle_capacity_hours: number;        // (num_techs * 8) − total_assigned_hours
}

// ── Dispatch plan types ───────────────────────────────────────────────────────

/**
 * A single job assignment within a dispatch plan.
 * suggested_start is computed by chaining jobs sequentially from 08:00 on the job date.
 */
export interface DispatchJobAssignment {
  job_id: string;
  /** ISO 8601 datetime — suggested start time for this job. */
  suggested_start: string;
  order_index: number;
}

/**
 * All jobs assigned to one technician in the optimizer's suggested dispatch plan.
 */
export interface DispatchTechAssignment {
  technician_id: string;
  jobs: DispatchJobAssignment[];
}

export interface OptimizationResult {
  baseline: ScheduleSnapshot;
  optimized: ScheduleSnapshot;
  delta: OptimizationDelta;
  diagnostics: Diagnostics;
  /**
   * Structured dispatch plan produced from the optimized assignment.
   * Jobs are chained sequentially per technician starting at 08:00 on the given date.
   * Pass this to POST /api/dispatch/apply-optimization to persist to the jobs table.
   */
  dispatch_plan: DispatchTechAssignment[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const OT_THRESHOLD = 8;       // hours
const OT_RATE_MULTIPLIER = 1.5; // overtime wage multiplier (simulation assumption)

// ── Scoring ───────────────────────────────────────────────────────────────────

/**
 * Deterministic priority score.
 *   Higher revenue  → higher score
 *   Higher urgency  → higher score
 *   Longer job      → lower score (opportunity cost)
 */
function computeScore(job: JobInput): number {
  return (
    job.revenue_estimate * 0.5 +
    job.urgency * 0.3 -
    job.duration_estimate_hours * 0.2
  );
}

// ── Snapshot builder ──────────────────────────────────────────────────────────

interface TechStats {
  name: string;
  hours: number;
  revenue: number;
}

function buildSnapshot(
  jobs: ScoredJob[],
  techStats: Map<string, TechStats>,
): ScheduleSnapshot {
  const numTechs = techStats.size;

  const technicians: TechnicianResult[] = Array.from(techStats.entries())
    .map(([id, { name, hours, revenue }]) => ({
      id,
      name,
      revenue,
      total_hours: hours,
      revenue_per_hour: hours > 0 ? round2(revenue / hours) : 0,
      overtime_flag: hours > OT_THRESHOLD,
    }))
    .sort((a, b) => b.revenue - a.revenue || a.id.localeCompare(b.id));

  const total_revenue = round2(jobs.reduce((s, j) => s + j.revenue_estimate, 0));
  const total_hours = round2(technicians.reduce((s, t) => s + t.total_hours, 0));
  const revenue_per_hour = total_hours > 0 ? round2(total_revenue / total_hours) : 0;
  const overtime_tech_count = technicians.filter((t) => t.overtime_flag).length;
  const workload_variance = stdDev(technicians.map((t) => t.total_hours));
  const capacity_utilization_rate =
    numTechs > 0 ? round2(total_hours / (numTechs * OT_THRESHOLD)) : 0;

  return {
    total_revenue,
    revenue_per_hour,
    overtime_tech_count,
    workload_variance,
    capacity_utilization_rate,
    technicians,
    jobs,
  };
}

// ── Capacity-aware allocation ─────────────────────────────────────────────────

interface TechSlot {
  id: string;
  name: string;
  assigned_jobs: ScoredJob[];
  total_hours: number;
  total_revenue: number;
}

/**
 * Assigns a job to the best available technician:
 *   1. Prefer technicians who can absorb the job without overtime (total_hours + duration ≤ 8).
 *      Among those, pick the one with the fewest hours (most available capacity).
 *   2. If all technicians would exceed 8 h, assign to whichever has the lowest
 *      projected total after adding this job (minimises overtime depth).
 *   Ties broken by technician id for determinism.
 */
function pickTechnician(slots: TechSlot[], duration: number): TechSlot {
  let best: TechSlot | null = null;

  // Pass 1 — find a slot that stays within threshold
  for (const slot of slots) {
    if (slot.total_hours + duration <= OT_THRESHOLD) {
      if (
        best === null ||
        slot.total_hours < best.total_hours ||
        (slot.total_hours === best.total_hours && slot.id < best.id)
      ) {
        best = slot;
      }
    }
  }

  if (best !== null) return best;

  // Pass 2 — all would overtime; pick lowest projected total
  for (const slot of slots) {
    const projected = slot.total_hours + duration;
    const bestProjected = best!.total_hours + duration;
    if (
      best === null ||
      projected < bestProjected ||
      (projected === bestProjected && slot.id < best!.id)
    ) {
      best = slot;
    }
  }

  return best!;
}

// ── Diagnostics ───────────────────────────────────────────────────────────────

function computeDiagnostics(optimized: ScheduleSnapshot): Diagnostics {
  const techs = optimized.technicians;

  const underutilized_count = techs.filter((t) => t.total_hours < 5).length;
  const overloaded_count = techs.filter((t) => t.total_hours > 9).length;

  const total_hours = round2(techs.reduce((s, t) => s + t.total_hours, 0));
  const idle_capacity_hours = round2(techs.length * OT_THRESHOLD - total_hours);

  let revenue_concentration_ratio = 0;
  if (techs.length > 1) {
    const maxRev = Math.max(...techs.map((t) => t.revenue));
    const minRev = Math.min(...techs.map((t) => t.revenue));
    // 0 signals undefined when min is zero (ratio would be infinite)
    revenue_concentration_ratio = minRev > 0 ? round2(maxRev / minRev) : 0;
  }

  return { underutilized_count, overloaded_count, revenue_concentration_ratio, idle_capacity_hours };
}

// ── Overtime simulation ───────────────────────────────────────────────────────

function computeOvertimeSimulation(
  baseline: ScheduleSnapshot,
  optimized: ScheduleSnapshot,
  averageHourlyLaborCost: number,
): OvertimeSimulation {
  const overtime_hours_before = round2(
    baseline.technicians.reduce((s, t) => s + Math.max(0, t.total_hours - OT_THRESHOLD), 0)
  );
  const overtime_hours_after = round2(
    optimized.technicians.reduce((s, t) => s + Math.max(0, t.total_hours - OT_THRESHOLD), 0)
  );
  const overtime_cost_before = round2(overtime_hours_before * averageHourlyLaborCost * OT_RATE_MULTIPLIER);
  const overtime_cost_after  = round2(overtime_hours_after  * averageHourlyLaborCost * OT_RATE_MULTIPLIER);

  return {
    average_hourly_labor_cost: averageHourlyLaborCost,
    overtime_hours_before,
    overtime_hours_after,
    overtime_cost_before,
    overtime_cost_after,
    estimated_margin_improvement: round2(overtime_cost_before - overtime_cost_after),
  };
}

// ── Main optimizer ────────────────────────────────────────────────────────────

export function optimizeJobs(jobs: JobInput[], averageHourlyLaborCost?: number): OptimizationResult {
  if (jobs.length === 0) {
    const emptySnapshot: ScheduleSnapshot = {
      total_revenue: 0,
      revenue_per_hour: 0,
      overtime_tech_count: 0,
      workload_variance: 0,
      capacity_utilization_rate: 0,
      technicians: [],
      jobs: [],
    };
    return {
      baseline: emptySnapshot,
      optimized: emptySnapshot,
      delta: { revenue_per_hour_change: 0, overtime_reduction: 0, workload_balance_improvement: 0, simulation: null },
      diagnostics: { underutilized_count: 0, overloaded_count: 0, revenue_concentration_ratio: 0, idle_capacity_hours: 0 },
      dispatch_plan: [],
    };
  }

  // ── Step 1: Score every job ────────────────────────────────────────────────
  const scored: ScoredJob[] = jobs.map((j) => ({
    ...j,
    score: round2(computeScore(j)),
  }));

  // ── Step 2: Sort by score descending, id ascending for determinism on ties ─
  const sortedByScore = [...scored].sort(
    (a, b) => b.score - a.score || a.id.localeCompare(b.id)
  );

  // ── Step 3: Build baseline snapshot (original assignments, original order) ─
  const baselineTechStats = new Map<string, TechStats>();
  for (const job of scored) {
    if (!baselineTechStats.has(job.technician_id)) {
      baselineTechStats.set(job.technician_id, {
        name: job.technician_name,
        hours: 0,
        revenue: 0,
      });
    }
    const entry = baselineTechStats.get(job.technician_id)!;
    entry.hours = round2(entry.hours + job.duration_estimate_hours);
    entry.revenue = round2(entry.revenue + job.revenue_estimate);
  }
  const baseline = buildSnapshot(scored, baselineTechStats);

  // ── Step 4: Create technician slots for allocation ─────────────────────────
  const slotMap = new Map<string, TechSlot>();
  for (const job of jobs) {
    if (!slotMap.has(job.technician_id)) {
      slotMap.set(job.technician_id, {
        id: job.technician_id,
        name: job.technician_name,
        assigned_jobs: [],
        total_hours: 0,
        total_revenue: 0,
      });
    }
  }
  const slots = Array.from(slotMap.values());

  // ── Step 5: Capacity-aware assignment ─────────────────────────────────────
  const jobIdToSlot = new Map<string, TechSlot>();
  for (const job of sortedByScore) {
    const slot = pickTechnician(slots, job.duration_estimate_hours);
    slot.assigned_jobs.push({ ...job, technician_id: slot.id, technician_name: slot.name });
    slot.total_hours = round2(slot.total_hours + job.duration_estimate_hours);
    slot.total_revenue = round2(slot.total_revenue + job.revenue_estimate);
    jobIdToSlot.set(job.id, slot);
  }

  // ── Step 6: Build optimized jobs list (score-sorted, updated assignments) ──
  const optimized_jobs: ScoredJob[] = sortedByScore.map((j) => {
    const ownerSlot = jobIdToSlot.get(j.id)!;
    return { ...j, technician_id: ownerSlot.id, technician_name: ownerSlot.name };
  });

  // ── Step 7: Build optimized snapshot ──────────────────────────────────────
  const optimizedTechStats = new Map<string, TechStats>();
  for (const slot of slots) {
    optimizedTechStats.set(slot.id, {
      name: slot.name,
      hours: slot.total_hours,
      revenue: slot.total_revenue,
    });
  }
  const optimized = buildSnapshot(optimized_jobs, optimizedTechStats);

  // ── Step 8: Compute deltas ─────────────────────────────────────────────────
  const delta: OptimizationDelta = {
    revenue_per_hour_change: round2(optimized.revenue_per_hour - baseline.revenue_per_hour),
    overtime_reduction: baseline.overtime_tech_count - optimized.overtime_tech_count,
    workload_balance_improvement: round2(baseline.workload_variance - optimized.workload_variance),
    simulation: averageHourlyLaborCost != null
      ? computeOvertimeSimulation(baseline, optimized, averageHourlyLaborCost)
      : null,
  };

  const diagnostics = computeDiagnostics(optimized);

  // ── Step 9: Build dispatch plan ────────────────────────────────────────────
  const dispatch_plan = buildDispatchPlan(slots);

  return { baseline, optimized, delta, diagnostics, dispatch_plan };
}

// ── Dispatch plan builder ─────────────────────────────────────────────────────

/**
 * Builds a structured dispatch plan from the post-allocation technician slots.
 * Jobs are chained sequentially per technician starting at 08:00 UTC on an
 * arbitrary reference date (the caller should shift to the actual job date
 * before persisting via /api/dispatch/apply-optimization).
 *
 * The reference date is kept neutral here because optimizeJobs() is date-agnostic.
 * The API route replaces the date prefix before writing to the DB.
 */
function buildDispatchPlan(slots: TechSlot[]): DispatchTechAssignment[] {
  const START_HOUR = 8; // 08:00 reference

  return slots
    .filter((slot) => slot.assigned_jobs.length > 0)
    .map((slot) => {
      let cursor = START_HOUR * 60; // minutes from midnight
      const jobs: DispatchJobAssignment[] = slot.assigned_jobs.map((job, idx) => {
        // Reference ISO string: use a neutral base date that the API will replace
        const suggestedStart = minutesToIso(cursor);
        cursor += job.duration_estimate_hours * 60;
        return { job_id: job.id, suggested_start: suggestedStart, order_index: idx };
      });
      return { technician_id: slot.id, jobs };
    });
}

/** Converts minutes-from-midnight to a reference ISO string (1970-01-01 base). */
function minutesToIso(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = Math.floor(minutes % 60).toString().padStart(2, "0");
  return `1970-01-01T${h}:${m}:00.000Z`;
}

/**
 * Re-dates a dispatch plan by replacing the neutral date prefix (1970-01-01)
 * with the actual job date. Called by /api/dispatch/apply-optimization.
 */
export function redatePlan(
  plan: DispatchTechAssignment[],
  date: string                 // YYYY-MM-DD
): DispatchTechAssignment[] {
  return plan.map((tech) => ({
    ...tech,
    jobs: tech.jobs.map((j) => ({
      ...j,
      suggested_start: j.suggested_start.replace("1970-01-01", date),
    })),
  }));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Population standard deviation of an array of numbers. */
function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return round2(Math.sqrt(variance));
}
