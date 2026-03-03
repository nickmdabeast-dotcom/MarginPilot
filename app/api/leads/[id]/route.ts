import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

// ─── PATCH /api/leads/:id ────────────────────────────────────────────────────
// Body: { status: string, company_id: string }
// Updates the status of a lead.
//
// Returns: { success: true }
//       or { success: false, error: string }

const VALID_STATUSES = new Set(["new", "contacted", "quoted", "scheduled", "lost"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, error: "Request body must be a JSON object" },
        { status: 400 }
      );
    }

    const { status, company_id } = body as Record<string, unknown>;

    if (!company_id || typeof company_id !== "string") {
      return NextResponse.json(
        { success: false, error: "company_id is required" },
        { status: 400 }
      );
    }

    if (!status || typeof status !== "string" || !VALID_STATUSES.has(status)) {
      return NextResponse.json(
        { success: false, error: `status must be one of: ${[...VALID_STATUSES].join(", ")}` },
        { status: 400 }
      );
    }

    const db = createServerClient();

    const { error, count } = await db
      .from("leads")
      .update({ status })
      .eq("id", id)
      .eq("company_id", company_id);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    if (count === 0) {
      // Supabase returns count only when head:true or count option is set,
      // so we don't fail here — the update may have matched without returning count.
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/leads/:id PATCH] Unhandled error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
