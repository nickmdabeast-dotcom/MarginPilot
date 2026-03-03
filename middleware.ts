import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  SUPABASE_AUTH_COOKIE,
  AUTH_COOKIE_OPTIONS,
  extractSessionTokens,
} from "@/lib/supabase/ssr";

const PROTECTED_APP_PREFIXES = [
  "/dashboard",
  "/dispatch",
  "/leads",
  "/jobs",
  "/customers",
  "/reports",
];
const PUBLIC_AUTH_PAGES = new Set(["/login", "/signup"]);
const PUBLIC_API_PREFIXES = ["/api/auth", "/api/health"];
const PUBLIC_ROUTE_PREFIXES = ["/auth/callback"];

function isProtectedAppRoute(pathname: string) {
  return PROTECTED_APP_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isPublicApiRoute(pathname: string) {
  return PUBLIC_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function safeRedirectPath(nextPath: string | null): string {
  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return "/dashboard";
  }

  return nextPath;
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
      },
      { status: 500 }
    );
  }

  const pathname = request.nextUrl.pathname;

  // Auth callback handles its own session — skip middleware auth check
  if (isPublicRoute(pathname)) {
    return response;
  }

  // ── Resolve authenticated user via session refresh ────────────────────────

  const rawSession =
    request.cookies.get(SUPABASE_AUTH_COOKIE)?.value ?? null;
  const tokens = extractSessionTokens(rawSession);

  let user = null;

  if (tokens) {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // setSession validates the access token and transparently refreshes it
    // via the refresh_token when the access token has expired.
    const { data, error } = await supabase.auth.setSession(tokens);

    if (!error && data.session) {
      user = data.session.user;

      // If the token was refreshed, propagate the new session cookie to both
      // the forwarded request (so API routes see the fresh token) and the
      // response (so the browser stores the updated session).
      if (data.session.access_token !== tokens.access_token) {
        const freshSession = JSON.stringify(data.session);

        request.cookies.set(SUPABASE_AUTH_COOKIE, freshSession);
        response = NextResponse.next({
          request: { headers: request.headers },
        });
        response.cookies.set(
          SUPABASE_AUTH_COOKIE,
          freshSession,
          AUTH_COOKIE_OPTIONS
        );
      }
    }
  }

  // ── Route protection ──────────────────────────────────────────────────────

  const isApiRoute = pathname.startsWith("/api/");
  const shouldProtectRoute = isApiRoute
    ? !isPublicApiRoute(pathname)
    : isProtectedAppRoute(pathname);

  if (!user && shouldProtectRoute) {
    if (isApiRoute) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const loginUrl = new URL("/login", request.url);
    const nextValue = `${pathname}${request.nextUrl.search}`;
    loginUrl.searchParams.set("next", nextValue);
    return NextResponse.redirect(loginUrl);
  }

  if (user && PUBLIC_AUTH_PAGES.has(pathname)) {
    const nextPath = safeRedirectPath(
      request.nextUrl.searchParams.get("next")
    );
    return NextResponse.redirect(new URL(nextPath, request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff|woff2)$).*)",
  ],
};
