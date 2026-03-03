import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_AUTH_COOKIE, AUTH_COOKIE_OPTIONS } from "@/lib/supabase/ssr";

/**
 * GET /auth/callback
 *
 * Handles the redirect from Supabase after email confirmation, password reset,
 * or OAuth sign-in.  Supabase appends a `code` query-param (PKCE flow) which
 * we exchange server-side for a session, then set the session cookie and
 * redirect the user into the app.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (!code) {
    // No code — redirect to login with an error hint
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(loginUrl);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { success: false, error: "Missing Supabase environment variables" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "invalid_code");
    return NextResponse.redirect(loginUrl);
  }

  // Build the redirect response and set the session cookie
  const redirectUrl = new URL(next, request.url);
  const response = NextResponse.redirect(redirectUrl);

  response.cookies.set(
    SUPABASE_AUTH_COOKIE,
    JSON.stringify(data.session),
    AUTH_COOKIE_OPTIONS
  );

  return response;
}
