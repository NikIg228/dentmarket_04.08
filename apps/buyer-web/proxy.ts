import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const dev = process.env.NODE_ENV !== "production";
  const apiOrigin = new URL(
    process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api",
    request.nextUrl.origin,
  ).origin;
  // Next.js reads x-nonce from the forwarded request and applies it to its
  // hydration scripts. This lets production CSP reject arbitrary inline JS.
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const contentSecurityPolicy = `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' ${apiOrigin} data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'nonce-${nonce}'${dev ? " 'unsafe-eval'" : ""}; connect-src 'self' ${apiOrigin}${dev ? " ws: wss:" : ""}`;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  response.headers.set("Permissions-Policy", "geolocation=(self)");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
