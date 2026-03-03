# Optimizer Diagnostics Report

## Entrypoints

| Layer | File | Function | Line |
|-------|------|----------|------|
| Core engine | `lib/optimize.ts` | `optimizeJobs()` | 317 |
| Server action | `actions/optimize.ts` | `runOptimization()` | 12 |
| API route | `app/api/optimize/route.ts` | `POST /api/optimize` | 15 |
| Apply results | `app/api/dispatch/apply-optimization/route.ts` | `POST` | 23 |
| Dashboard UI | `app/dashboard/page.tsx` | `ResultsPanel` | 326 |

## What the Optimizer Uses (Input)

- `JobInput[]` fetched via `getJobsByDate(companyId, date, db)` from `services/jobs.ts`
- Each job has: `id`, `technician_id`, `technician_name`, `revenue_estimate`, `duration_estimate_hours`, `urgency`
- Optional: `averageHourlyLaborCost` for overtime cost simulation

## What It Outputs

- `OptimizationResult` containing:
  - `baseline` — snapshot of original technician assignments
  - `optimized` — snapshot after capacity-aware reallocation
  - `delta` — revenue/hr change, overtime reduction, variance improvement
  - `diagnostics` — underutilized/overloaded counts, idle capacity
  - `dispatch_plan` — timestamped job chains per technician (reference date 1970-01-01)

## Where Results Are Persisted

1. **Optimization run record** — `optimization_runs` table (via `POST /api/optimize`, line 60)
2. **Job updates** — `jobs` table updated via `POST /api/dispatch/apply-optimization` when user applies

## Evidence: Imbalanced Fixture Results

Fixture: `tests/fixtures/optimizer_should_improve.csv` — Alice overloaded (17h), Bob/Carol idle (1.5h each).

### Per-Tech Breakdown

| Technician | Baseline Hrs | Optimized Hrs | Baseline Rev | Optimized Rev |
|------------|-------------|---------------|-------------|---------------|
| Alice | 17.0h | 7.0h | $13,450 | $5,120 |
| Bob | 1.5h | 6.5h | $320 | $4,950 |
| Carol | 1.5h | 6.5h | $530 | $4,230 |

### Key Metrics

| Metric | Baseline | Optimized | Change |
|--------|----------|-----------|--------|
| Workload variance | 7.31h | 0.24h | **-96.7%** |
| Overtime techs | 1 | 0 | **-100%** |
| Revenue/hr | $715/hr | $715/hr | preserved |
| Changed jobs | — | 5 of 10 | — |

### Changed Assignments

| Job | From | To |
|-----|------|----|
| J-002 (Ductwork $3,800) | Alice | Bob |
| J-003 (AC Repair $1,500) | Alice | Carol |
| J-007 (Furnace $950) | Alice | Bob |
| J-008 (Compressor $2,200) | Alice | Carol |
| J-005 (Filter $120) | Bob | Alice |

### Invariants

- No duplicate job IDs: PASS
- No missing job IDs: PASS
- Revenue preserved: PASS ($14,300 = $14,300)
- Duration preserved: PASS (20h = 20h)

## Evidence: Balanced Fixture Results

Fixture: `tests/fixtures/optimizer_balanced.csv` — 3 techs, 3 identical jobs each (6h, $1500).

- Workload variance: 0 baseline, 0 optimized — **no degradation**
- Score: preserved
- All invariants: PASS

## Root Cause Analysis

**The optimizer IS working correctly.** It:
1. Scores jobs by `revenue * 0.5 + urgency * 0.3 - duration * 0.2`
2. Sorts by score descending
3. Allocates highest-scored jobs first to technicians with available capacity (<8h)
4. Falls back to lowest-hours technician when all exceed threshold

**UI wiring is correct.** The dashboard:
1. Calls `POST /api/optimize` after CSV upload (`handleUploadSuccess`, line 374)
2. Stores result in `liveResult` state
3. `ResultsPanel` renders both `baseline` and `optimized` snapshots
4. KPI cards read from `optimized` (the correct data source)
5. Executive Summary compares `baseline` vs `optimized` values

**No wiring bug found.** The "No change" display users may see is expected when:
- All technicians are already balanced (no beneficial move)
- Only one technician exists (nothing to redistribute)
- All jobs already fit within 8h per tech

## How to Run Diagnostics

### Automated Tests
```bash
# Full test suite (includes diagnostics tests)
npm run test

# Just the diagnostics tests
npx tsx --test tests/optimizer-diagnostics.test.ts
```

### Server-Side Debug Logging
```bash
# Add to .env.local:
DEBUG_OPTIMIZER=1

# Then run:
npm run dev

# The API route will log debug info to the terminal on each POST /api/optimize call
```

### UI Debug Panel
```bash
# Add to .env.local:
NEXT_PUBLIC_DEBUG_OPTIMIZER=1

# Then run:
npm run dev
# Navigate to /dashboard — a yellow "Optimizer Debug" accordion appears below the status badge
```

### Reproduce via UI
1. Start dev server with debug flags
2. Navigate to `/dashboard`
3. Upload `tests/fixtures/optimizer_should_improve.csv` with date `2026-03-10`
4. Observe optimization results + debug panel showing changed assignments

## Files Changed

| File | Change |
|------|--------|
| `lib/optimize.ts` | Added `OptimizerDebugInfo` type, `computeDebugInfo()` export, `_debug` field on result |
| `app/api/optimize/route.ts` | Added guarded debug logging after optimization |
| `app/dashboard/page.tsx` | Added `OptimizerDebugPanel` component (dev-only) |
| `tests/optimizer-diagnostics.test.ts` | 13 new tests: imbalanced, balanced, debug info |
| `tests/fixtures/optimizer_should_improve.csv` | Imbalanced fixture (Alice overloaded) |
| `tests/fixtures/optimizer_balanced.csv` | Balanced control fixture |
| `docs/optimizer_diagnostics.md` | This report |
