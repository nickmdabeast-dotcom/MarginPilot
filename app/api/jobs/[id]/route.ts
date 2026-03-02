import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireCompanyId } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// ─── PATCH /api/jobs/[id] ─────────────────────────────────────────────────────
// Updates dispatch-relevant fields on a job.
//
// Body: {
//   technician_id?: string | null,
//   scheduled_start?: string,     (ISO 8601)
//   scheduled_end?: string,       (ISO 8601)
//   status?: string,
//   order_index?: number,
// }
// Returns: { success: true, job: Job }
//       or { success: false, error: string }

const ALLOWED_STATUSES = new Set(["scheduled", "en_route", "on_site", "completed", "canceled"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = createServerClient();
    const { companyId } = await requireCompanyId(db);

    const { id } = params;

    if (!id) {
      return NextResponse.json({ success: false, error: "Job id is required" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Request body must be a JSON object" }, { status: 400 });
    }

    const { technician_id, scheduled_start, scheduled_end, status, order_index } =
      body as Record<string, unknown>;

    // Build update payload — only include fields that were provided
    const updates: Record<string, unknown> = {};

    if ("technician_id" in (body as object)) {
      updates.technician_id = technician_id === null ? null : typeof technician_id === "string" ? technician_id : undefined;
    }
    if (scheduled_start !== undefined) {
      if (typeof scheduled_start !== "string" || isNaN(new Date(scheduled_start).getTime())) {
        return NextResponse.json({ success: false, error: "scheduled_start must be a valid ISO 8601 datetime" }, { status: 400 });
      }
      updates.scheduled_start = scheduled_start;
    }
    if (scheduled_end !== undefined) {
      if (typeof scheduled_end !== "string" || isNaN(new Date(scheduled_end).getTime())) {
        return NextResponse.json({ success: false, error: "scheduled_end must be a valid ISO 8601 datetime" }, { status: 400 });
      }
      updates.scheduled_end = scheduled_end;
    }
    if (status !== undefined) {
      if (typeof status !== "string" || !ALLOWED_STATUSES.has(status)) {
        return NextResponse.json(
          { success: false, error: `status must be one of: ${Array.from(ALLOWED_STATUSES).join(", ")}` },
          { status: 400 }
        );
      }
      updates.status = status;
    }
    if (order_index !== undefined) {
      if (typeof order_index !== "number" || !Number.isInteger(order_index) || order_index < 0) {
        return NextResponse.json({ success: false, error: "order_index must be a non-negative integer" }, { status: 400 });
      }
      updates.order_index = order_index;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: "No updatable fields provided" }, { status: 400 });
    }

    // Verify ownership and apply update atomically
    const { data: job, error } = await db
      .from("jobs")
      .update(updates)
      .eq("id", id)
      .eq("company_id", companyId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    if (!job) {
      return NextResponse.json(
        { success: false, error: "Job not found or does not belong to this company" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, job });

  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.status }
      );
    }

    console.error("[/api/jobs/[id] PATCH] Unhandled error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
