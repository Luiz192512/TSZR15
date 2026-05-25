import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import {
  ADMIN_SESSION_COOKIE,
  getAdminSessionCookieOptions,
  isAdminSessionValueValidAtEdge
} from "./src/admin/admin-session-edge.js";

function isAdminPath(pathname) {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function addAdminSecurityHeaders(response) {
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.headers.set("Referrer-Policy", "same-origin");

  return response;
}

function redirectToAdminLogin(request) {
  const redirectUrl = new URL("/entrar", request.url);
  redirectUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);

  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set(ADMIN_SESSION_COOKIE, "", getAdminSessionCookieOptions({ maxAge: 0 }));

  return addAdminSecurityHeaders(response);
}

export async function proxy(request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const isAdminRequest = isAdminPath(request.nextUrl.pathname);

  let response = NextResponse.next({ request });

  if (isAdminRequest) {
    const adminSessionValue = request.cookies.get(ADMIN_SESSION_COOKIE)?.value ?? "";

    if (!(await isAdminSessionValueValidAtEdge(adminSessionValue))) {
      return redirectToAdminLogin(request);
    }

    return addAdminSecurityHeaders(response);
  }

  if (!supabaseUrl || !supabaseKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      }
    }
  });

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
  ]
};
