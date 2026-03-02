import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { optimizeJobs, redatePlan } from "@/lib/optimize";
import { getJobsByDate } from "@/services/jobs";
import type { Json } from "@/types";

// ─── POST /api/optimize ───────────────────────────────────────────────────────
// Body: { company_id: string, date: string, average_hourly_labor_cost?: number }
// Returns: { success: true, run_id: string|null, result: OptimizationResult }
//       or { success: false, error: string }

export async function POST(req: NextRequest) {
  try {
    // 1. Parse body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Request body must be a JSON object" }, { status: 400 });
    }

    const { company_id, date, average_hourly_labor_cost } = body as Record<string, unknown>;

    if (!company_id || typeof company_id !== "string") {
      return NextResponse.json({ success: false, error: "company_id is required" }, { status: 400 });
    }
    if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ success: false, error: "date must be YYYY-MM-DD" }, { status: 400 });
    }

    let laborCost: number | undefined;
    if (average_hourly_labor_cost !== undefined) {
      if (typeof average_hourly_labor_cost !== "number" || average_hourly_labor_cost <= 0) {
        return NextResponse.json({ success: false, error: "average_hourly_labor_cost must be a positive number" }, { status: 400 });
      }
      laborCost = average_hourly_labor_cost;
    }

    // 2. Connect to DB
    const db = createServerClient();

    // 3. Fetch jobs
    const jobs = await getJobsByDate(company_id, date, db);

    if (jobs.length === 0) {
      return NextResponse.json(
        { success: false, error: `No jobs found for company ${company_id} on ${date}` },
        { status: 404 }
      );
    }

    // 4. Run optimization engine
    const result = optimizeJobs(jobs, laborCost);

    // 5. Persist run record (best-effort — don't fail the response if this errors)
    // Store the re-dated dispatch plan so apply-optimization can look it up by run_id.
    const { data: runRecord, error: insertError } = await db
      .from("optimization_runs")
      .insert({
        company_id,
        run_date: date,
        total_revenue_before: result.baseline.total_revenue,
        total_revenue_after: result.optimized.total_revenue,
        dispatch_plan: redatePlan(result.dispatch_plan, date) as unknown as Json,
      })
      .select("id")
      .single();

    return NextResponse.json(
      {
        success: true,
        run_id: insertError ? null : runRecord?.id ?? null,
        result,
        ...(insertError ? { warning: "Run record could not be saved" } : {}),
      },
      { status: 200 }
    );

  } catch (err) {
    console.error("[/api/optimize] Unhandled error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
