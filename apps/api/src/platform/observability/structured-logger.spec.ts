import { once } from "node:events";
import { createServer, request, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import type { LoggerOptions } from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

const capture = vi.hoisted(() => ({ lines: [] as string[] }));

// Keep real Pino/redaction/serializers; replace only the output destination.
vi.mock("pino", async (importOriginal) => {
  const actual = await importOriginal<typeof import("pino")>();
  return {
    ...actual,
    default: (options: LoggerOptions) => actual.pino(options, {
      write(line: string) { capture.lines.push(line); },
    }),
  };
});
vi.mock("../config/environment", () => ({
  environment: () => ({ LOG_LEVEL: "trace" }),
}));

import { httpLoggerMiddleware, structuredLogger } from "./structured-logger";

describe("structured HTTP logger credential boundary", () => {
  beforeEach(() => { capture.lines.length = 0; });

  it.each([
    { path: "/api/auth/login", status: 201, cookies: ["mp_refresh=synthetic-issued; HttpOnly; Path=/api/auth", "mp_csrf=synthetic-issued-csrf; Path=/api/auth"] },
    { path: "/api/auth/refresh", status: 201, cookies: "mp_refresh=synthetic-rotated; HttpOnly; Path=/api/auth" },
    { path: "/api/auth/logout", status: 200, cookies: ["mp_refresh=; Max-Age=0; Path=/api/auth", "mp_csrf=; Max-Age=0; Path=/api/auth"] },
    { path: "/api/auth/login", status: 500, cookies: ["mp_refresh=synthetic-error-cookie; HttpOnly"] },
  ])("redacts serialized headers without changing the $path $status response", async ({ path, status, cookies }) => {
    const middleware = httpLoggerMiddleware();
    const requestSecrets = ["synthetic-bearer", "synthetic-incoming-cookie", "synthetic-incoming-csrf"];
    const server = createServer((req, res) => {
      middleware(req, res);
      res.statusCode = status;
      // Real Node HTTP normalizes mixed-case header names before serialization.
      res.setHeader("SeT-CoOkIe", cookies);
      res.setHeader("content-type", "application/json");
      req.log.info({ res }, "synthetic auth response prepared");
      res.end(JSON.stringify({ ok: status < 400 }));
    });
    server.listen(0, "127.0.0.1");
    try {
      await once(server, "listening");
      const response = await new Promise<{ status: number | undefined; headers: IncomingHttpHeaders; body: string }>((resolve, reject) => {
        const req = request({
          hostname: "127.0.0.1",
          port: (server.address() as AddressInfo).port,
          path,
          method: "POST",
          agent: false,
          headers: {
            Authorization: `Bearer ${requestSecrets[0]}`,
            Cookie: `mp_refresh=${requestSecrets[1]}`,
            "X-CsRf-ToKeN": requestSecrets[2],
            "x-request-id": "audit-log-regression",
            "content-type": "application/json",
          },
        }, (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (chunk: string) => { body += chunk; });
          res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
          res.on("error", reject);
        });
        req.on("error", reject);
        req.end(JSON.stringify({ password: "synthetic-body-password" }));
      });

      // Ordinary auth wire behavior remains intact, including cookie attributes.
      expect(response.status).toBe(status);
      expect(response.headers["set-cookie"]).toEqual(Array.isArray(cookies) ? cookies : [cookies]);
      expect(response.headers["x-request-id"]).toBe("audit-log-regression");
      expect(JSON.parse(response.body)).toEqual({ ok: status < 400 });

      const logs = capture.lines.map((line) => JSON.parse(line));
      expect(logs).toHaveLength(2); // Explicit child event and automatic completion/error.
      for (const entry of logs) {
        expect(entry.req.headers.authorization).toBe("[REDACTED]");
        expect(entry.req.headers.cookie).toBe("[REDACTED]");
        expect(entry.req.headers["x-csrf-token"]).toBe("[REDACTED]");
        expect(entry.res.headers["set-cookie"]).toBe("[REDACTED]");
        expect(entry.req).toMatchObject({ id: "audit-log-regression", method: "POST", url: path });
        expect(entry.res.headers["content-type"]).toBe("application/json");
        expect(entry.req.body).toBeUndefined();
        expect(entry.res.body).toBeUndefined();
      }
      const completion = logs[1];
      expect(completion.res.statusCode).toBe(status);
      expect(completion.responseTime).toEqual(expect.any(Number));
      expect(completion.correlationId).toBe("audit-log-regression");
      const serialized = capture.lines.join("");
      for (const secret of [...requestSecrets, "synthetic-body-password", ...(Array.isArray(cookies) ? cookies : [cookies])]) {
        expect(serialized).not.toContain(secret);
      }
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("preserves existing root secret redaction and safe operational fields", () => {
    structuredLogger.info({
      event: "runtime.ready",
      role: "worker",
      password: "synthetic-password",
      token: "synthetic-token",
      secret: "synthetic-secret",
      credentials: { password: "synthetic-nested-password" },
    });
    expect(JSON.parse(capture.lines[0])).toMatchObject({
      event: "runtime.ready", role: "worker",
      password: "[REDACTED]", token: "[REDACTED]", secret: "[REDACTED]", credentials: "[REDACTED]",
    });
    expect(capture.lines.join("")).not.toContain("synthetic-");
  });
});
