import { type NextRequest, NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/onboarding",
  "/knowledge",
  "/settings",
  "/chat",
  "/admin",
];

const AUTH_ONLY_PREFIXES = ["/login", "/signup", "/auth/login", "/auth/signup"];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function isAuthOnlyPath(pathname: string): boolean {
  return AUTH_ONLY_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const pathname = request.nextUrl.pathname;

  // Widget/embed must stay embeddable on external websites.
  if (pathname === "/widget" || pathname.startsWith("/widget/")) {
    response.headers.delete("X-Frame-Options");
    response.headers.delete("x-frame-options");
    const frameAncestors =
      process.env.WIDGET_CSP_FRAME_ANCESTORS?.trim() ||
      "* chrome-extension: file:";
    response.headers.set(
      "Content-Security-Policy",
      `frame-ancestors ${frameAncestors};`,
    );
  }

  if (isAuthOnlyPath(pathname) && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (isProtectedPath(pathname) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set(
      "redirect",
      `${pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
