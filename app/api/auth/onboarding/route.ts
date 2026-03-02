import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const db = createServerClient();
    const user = await getSessionUser(db);

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    let companyName: string | null = null;
    try {
      const body = (await req.json()) as { company_name?: unknown };
      if (typeof body.company_name === "string" && body.company_name.trim()) {
        companyName = body.company_name.trim();
      }
    } catch {
      // Optional body.
    }

    const { data: companyId, error } = await db.rpc("ensure_user_profile", {
      p_company_name: companyName,
    });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, company_id: companyId });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to run onboarding",
      },
      { status: 500 }
    );
  }
}
