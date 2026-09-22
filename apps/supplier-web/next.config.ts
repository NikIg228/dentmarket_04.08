import type { NextConfig } from "next";
import { frontendDeploymentEnvironment } from "@marketplace/schemas";
import path from "node:path";

const nextConfig: NextConfig = {
  env: frontendDeploymentEnvironment(process.env),
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  transpilePackages: ["@marketplace/ui", "@marketplace/api-client"],
  allowedDevOrigins: ["127.0.0.1", "localhost", "dentmarket.localhost", "marketplace.localhost", "buyer.localhost", "supplier.localhost", "admin.localhost"],
  reactStrictMode: true,
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    const api = (process.env.INTERNAL_API_URL ?? "http://127.0.0.1:4012/api").replace(/\/$/, "");
    return [{ source: "/api/:path*", destination: api + "/:path*" }];
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders() }];
  },
};

function securityHeaders() {
  const apiOrigin = (() => {
    try {
      return new URL(
        process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api",
      ).origin;
    } catch {
      return "http://127.0.0.1:4012";
    }
  })();
  const dev = process.env.NODE_ENV !== "production";
  return [
    {
      key: "Content-Security-Policy",
      value: `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob:; font-src 'self'; style-src 'self'; script-src 'self'${dev ? " 'unsafe-eval'" : ""}; connect-src 'self' ${apiOrigin}${dev ? " ws: wss:" : ""}`,
    },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=()",
    },
    ...(dev
      ? []
      : [
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
        ]),
  ];
}

export default nextConfig;
