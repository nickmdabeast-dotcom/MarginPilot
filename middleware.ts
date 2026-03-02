import { NextRequest, NextResponse } from "next/server";
import {
  createServerClient,
  extractAccessTokenFromStoredSession,
  SUPABASE_AUTH_COOKIE,
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

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );

        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });

        cookiesToSet.forEach(({ name, value }) => response.cookies.set(name, value));
      },
    },
  });

  const rawSession = request.cookies.get(SUPABASE_AUTH_COOKIE)?.value ?? null;
  const accessToken = extractAccessTokenFromStoredSession(rawSession);
  let user = null;
  if (accessToken) {
    const { data } = await supabase.auth.getUser(accessToken);
    user = data.user;
  }

  const pathname = request.nextUrl.pathname;
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
    const nextPath = safeRedirectPath(request.nextUrl.searchParams.get("next"));
    return NextResponse.redirect(new URL(nextPath, request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff|woff2)$).*)",
  ],
};
