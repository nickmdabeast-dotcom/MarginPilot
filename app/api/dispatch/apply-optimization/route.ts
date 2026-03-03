import { NextRequest, NextResponse } from "next/server";
import { isAuthError } from "@/lib/auth";
import { getApiContext } from "@/lib/apiContext";
import { chunk } from "@/lib/utils";
import type { DispatchTechAssignment } from "@/lib/optimize";

const BATCH_SIZE = 50;

export const dynamic = "force-dynamic";

// ─── POST /api/dispatch/apply-optimization ────────────────────────────────────
// Applies the optimizer's suggested technician assignments and job ordering
// to the jobs table. Intended to be called after user confirms on the dispatch page.
//
// Body: {
//   optimization_run_id?: string,         // optional — for audit; not required to proceed
//   assignments?: DispatchTechAssignment[], // if omitted, fetched from run record
// }
//
// The route requires EITHER optimization_run_id (to load plan from DB)
// OR an explicit assignments array. If both are supplied, assignments takes precedence.
//
// Returns: { success: true, updated_count: number }
//       or { success: false, error: string }

export async function POST(req: NextRequest) {
  try {
    const { db, companyId } = await getApiContext();

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Request body must be a JSON object" }, { status: 400 });
    }

    const { optimization_run_id, assignments } = body as Record<string, unknown>;

    let plan: DispatchTechAssignment[];

    if (Array.isArray(assignments) && assignments.length > 0) {
      // Caller passed assignments directly
      plan = assignments as DispatchTechAssignment[];
    } else if (typeof optimization_run_id === "string") {
      // Load plan from the stored run record
      const { data: run, error: runError } = await db
        .from("optimization_runs")
        .select("id, dispatch_plan")
        .eq("id", optimization_run_id)
        .eq("company_id", companyId)
        .single();

      if (runError || !run) {
        return NextResponse.json(
          { success: false, error: "Optimization run not found or does not belong to this company" },
          { status: 404 }
        );
      }

      if (!run.dispatch_plan || !Array.isArray(run.dispatch_plan)) {
        return NextResponse.json(
          { success: false, error: "No dispatch plan stored for this optimization run" },
          { status: 422 }
        );
      }

      plan = run.dispatch_plan as unknown as DispatchTechAssignment[];
    } else {
      return NextResponse.json(
        { success: false, error: "Provide either optimization_run_id or an assignments array" },
        { status: 400 }
      );
    }

    // Flatten plan into individual update operations
    const ops = plan.flatMap(({ technician_id, jobs }) =>
      jobs.map(({ job_id, suggested_start, order_index }) => ({
        technician_id, job_id, suggested_start, order_index,
      }))
    );

    // Apply updates in controlled batches to avoid connection pool exhaustion
    let updated_count = 0;
    const errors: string[] = [];
    const batches = chunk(ops, BATCH_SIZE);
    const startMs = Date.now();

    for (const batch of batches) {
      await Promise.all(
        batch.map(async ({ technician_id, job_id, suggested_start, order_index }) => {
          const { error } = await db
            .from("jobs")
            .update({
              technician_id,
              scheduled_start: suggested_start,
              order_index,
            })
            .eq("id", job_id)
            .eq("company_id", companyId);

          if (error) {
            errors.push(`job ${job_id}: ${error.message}`);
          } else {
            updated_count++;
          }
        })
      );
    }

    const elapsed_ms = Date.now() - startMs;

    const SHOW_DIAGNOSTICS =
      process.env.NODE_ENV !== "production" || process.env.DEBUG_APPLY_OPTIMIZATION === "1";

    return NextResponse.json(
      {
        success: true,
        updated_count,
        ...(errors.length > 0 ? { warnings: errors } : {}),
        ...(SHOW_DIAGNOSTICS ? { _diagnostics: { batch_count: batches.length, elapsed_ms } } : {}),
      },
      { status: 200 }
    );

  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.status }
      );
    }

    console.error("[/api/dispatch/apply-optimization] Unhandled error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
