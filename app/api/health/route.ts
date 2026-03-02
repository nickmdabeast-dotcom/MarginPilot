import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ? "set" : "MISSING",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "set" : "MISSING",
  });
}
