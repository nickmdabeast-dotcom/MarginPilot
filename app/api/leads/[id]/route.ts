import { NextRequest, NextResponse } from "next/server";
import { isAuthError, requireCompanyId } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// ─── PATCH /api/leads/:id ────────────────────────────────────────────────────
// Body: { status: string }
// Updates the status of a lead. company_id derived from session.
//
// Returns: { success: true }
//       or { success: false, error: string }

const VALID_STATUSES = new Set(["new", "contacted", "quoted", "scheduled", "lost"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = createServerClient();
    const { companyId } = await requireCompanyId(db);
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

    const { status } = body as Record<string, unknown>;

    if (!status || typeof status !== "string" || !VALID_STATUSES.has(status)) {
      return NextResponse.json(
        { success: false, error: `status must be one of: ${[...VALID_STATUSES].join(", ")}` },
        { status: 400 }
      );
    }

    const { error, count } = await db
      .from("leads")
      .update({ status })
      .eq("id", id)
      .eq("company_id", companyId);

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
    if (isAuthError(err)) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.status }
      );
    }

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
