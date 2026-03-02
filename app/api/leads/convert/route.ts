import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireCompanyId } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";

// ─── POST /api/leads/convert ──────────────────────────────────────────────────
// Converts a lead into a scheduled job.
//
// Body: {
//   lead_id: string,
//   scheduled_start: string,      // ISO 8601 datetime
//   duration_minutes: number,     // positive integer
//   revenue_estimate?: number,    // defaults to 0
//   urgency?: number,             // 1–5, defaults to 3
//   technician_id?: string,
// }
// Returns: { success: true, job: Job }
//       or { success: false, error: string }

export async function POST(req: NextRequest) {
  try {
    const db = createServerClient();
    const { companyId } = await requireCompanyId(db);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Request body must be a JSON object" }, { status: 400 });
    }

    const {
      lead_id,
      scheduled_start,
      duration_minutes,
      revenue_estimate = 0,
      urgency = 3,
      technician_id,
    } = body as Record<string, unknown>;

    // Validate required fields
    if (!lead_id || typeof lead_id !== "string") {
      return NextResponse.json({ success: false, error: "lead_id is required" }, { status: 400 });
    }
    if (!scheduled_start || typeof scheduled_start !== "string") {
      return NextResponse.json({ success: false, error: "scheduled_start is required (ISO 8601)" }, { status: 400 });
    }
    if (typeof duration_minutes !== "number" || duration_minutes <= 0 || !Number.isFinite(duration_minutes)) {
      return NextResponse.json({ success: false, error: "duration_minutes must be a positive number" }, { status: 400 });
    }

    const startDate = new Date(scheduled_start);
    if (isNaN(startDate.getTime())) {
      return NextResponse.json({ success: false, error: "scheduled_start is not a valid date" }, { status: 400 });
    }

    // 1. Fetch lead — validate it belongs to this company and is not already converted
    const { data: lead, error: leadFetchError } = await db
      .from("leads")
      .select("id, company_id, customer_id, service_type, status")
      .eq("id", lead_id)
      .eq("company_id", companyId)
      .single();

    if (leadFetchError || !lead) {
      return NextResponse.json(
        { success: false, error: "Lead not found or does not belong to this company" },
        { status: 404 }
      );
    }

    if (lead.status === "scheduled" || lead.status === "completed") {
      return NextResponse.json(
        { success: false, error: `Lead is already ${lead.status}` },
        { status: 409 }
      );
    }

    // 2. Compute derived fields
    const scheduledEnd = new Date(startDate.getTime() + duration_minutes * 60 * 1000);
    const jobDate = startDate.toISOString().split("T")[0]; // YYYY-MM-DD
    const durationHours = duration_minutes / 60;

    const urgencyNum = typeof urgency === "number" ? Math.round(urgency) : 3;
    const clampedUrgency = Math.min(5, Math.max(1, urgencyNum));
    const revenueNum = typeof revenue_estimate === "number" ? revenue_estimate : 0;

    // 3. Create job
    const { data: job, error: jobError } = await db
      .from("jobs")
      .insert({
        company_id: companyId,
        customer_id: lead.customer_id ?? undefined,
        technician_id: typeof technician_id === "string" ? technician_id : null,
        job_date: jobDate,
        revenue_estimate: revenueNum,
        duration_estimate_hours: durationHours,
        urgency: clampedUrgency,
        status: "scheduled",
        scheduled_start: startDate.toISOString(),
        scheduled_end: scheduledEnd.toISOString(),
      })
      .select()
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { success: false, error: `Failed to create job: ${jobError?.message ?? "no data returned"}` },
        { status: 500 }
      );
    }

    // 4. Update lead status to 'scheduled'
    await db
      .from("leads")
      .update({ status: "scheduled" })
      .eq("id", lead_id);

    return NextResponse.json({ success: true, job }, { status: 201 });

  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.status }
      );
    }

    console.error("[/api/leads/convert] Unhandled error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
