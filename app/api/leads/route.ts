import { NextRequest, NextResponse } from "next/server";
import { isAuthError } from "@/lib/auth";
import { getApiContext } from "@/lib/apiContext";

export const dynamic = "force-dynamic";

// ─── POST /api/leads ──────────────────────────────────────────────────────────
// Body: {
//   full_name: string,
//   phone: string,
//   email?: string,
//   address?: string,
//   service_type?: string,
//   urgency?: string,       // 'asap' | 'soon' | 'flexible'
//   source?: string,
//   notes?: string,
// }
// Returns: { success: true, lead: Lead, customer: Customer }
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

    const {
      full_name,
      phone,
      email,
      address,
      service_type,
      urgency = "soon",
      source = "website",
      notes,
    } = body as Record<string, unknown>;

    if (!full_name || typeof full_name !== "string" || !full_name.trim()) {
      return NextResponse.json({ success: false, error: "full_name is required" }, { status: 400 });
    }
    if (!phone || typeof phone !== "string" || !phone.trim()) {
      return NextResponse.json({ success: false, error: "phone is required" }, { status: 400 });
    }

    // 1. Create customer
    const { data: customer, error: customerError } = await db
      .from("customers")
      .insert({
        company_id: companyId,
        full_name: (full_name as string).trim(),
        phone: (phone as string).trim(),
        email: typeof email === "string" ? email.trim() || null : null,
        address: typeof address === "string" ? address.trim() || null : null,
      })
      .select()
      .single();

    if (customerError || !customer) {
      return NextResponse.json(
        { success: false, error: `Failed to create customer: ${customerError?.message ?? "no data returned"}` },
        { status: 500 }
      );
    }

    // 2. Create lead linked to the new customer
    const { data: lead, error: leadError } = await db
      .from("leads")
      .insert({
        company_id: companyId,
        customer_id: customer.id,
        source: typeof source === "string" ? source : "website",
        service_type: typeof service_type === "string" ? service_type.trim() || null : null,
        urgency: typeof urgency === "string" ? urgency : "soon",
        status: "new",
        notes: typeof notes === "string" ? notes.trim() || null : null,
      })
      .select()
      .single();

    if (leadError || !lead) {
      return NextResponse.json(
        { success: false, error: `Failed to create lead: ${leadError?.message ?? "no data returned"}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, lead, customer }, { status: 201 });

  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.status }
      );
    }

    console.error("[/api/leads] Unhandled error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

// ─── GET /api/leads?status= ───────────────────────────────────────────────────
// Returns all leads for the authenticated company, optionally filtered by status.
// Joins customer name for display.

export async function GET(req: NextRequest) {
  try {
    const { db, companyId } = await getApiContext();

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    let query = db
      .from("leads")
      .select("*, customers(full_name, phone, email)")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, leads: data ?? [] });

  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.status }
      );
    }

    console.error("[/api/leads GET] Unhandled error:", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
