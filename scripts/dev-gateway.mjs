import http from "node:http";
import net from "node:net";

const gatewayHost = process.env.DEV_GATEWAY_HOST ?? "127.0.0.1";
const gatewayPort = Number(process.env.DEV_GATEWAY_PORT ?? "3080");

const apiTarget = { host: "127.0.0.1", port: Number(process.env.API_PORT ?? 4012), name: "API" };
const domainTargets = new Map([
  ["dentmarket.localhost", { host: "127.0.0.1", port: 3003, name: "Landing" }],
  ["marketplace.localhost", { host: "127.0.0.1", port: 3001, name: "Marketplace" }],
  ["buyer.localhost", { host: "127.0.0.1", port: 3001, name: "Marketplace" }],
  ["supplier.localhost", { host: "127.0.0.1", port: 3002, name: "Supplier" }],
  ["admin.localhost", { host: "127.0.0.1", port: 3000, name: "Admin" }],
  ["localhost", { host: "127.0.0.1", port: 3003, name: "Landing" }],
  ["127.0.0.1", { host: "127.0.0.1", port: 3003, name: "Landing" }],
]);

function requestHostname(request) {
  const host = request.headers.host ?? "";
  if (host.startsWith("[")) return host.slice(1, host.indexOf("]"));
  return host.split(":", 1)[0].toLowerCase();
}

function isApiRequest(request) {
  const pathname = new URL(request.url ?? "/", "http://gateway.local").pathname;
  return pathname === "/api" || pathname.startsWith("/api/");
}

function resolveTarget(request) {
  if (!domainTargets.has(requestHostname(request))) return undefined;
  if (isApiRequest(request)) return apiTarget;
  return domainTargets.get(requestHostname(request));
}

function gatewayDescription() {
  return {
    status: "ok",
    service: "dentmarket-dev-gateway",
    routes: {
      landing: `http://dentmarket.localhost:${gatewayPort}`,
      marketplace: `http://marketplace.localhost:${gatewayPort}`,
      supplier: `http://supplier.localhost:${gatewayPort}`,
      admin: `http://admin.localhost:${gatewayPort}`,
      api: `http://dentmarket.localhost:${gatewayPort}/api/health`,
    },
  };
}

function proxyHeaders(request, target) {
  const headers = {
    ...request.headers,
    "x-forwarded-host": request.headers.host ?? "",
    "x-forwarded-port": String(gatewayPort),
    "x-forwarded-proto": "http",
  };

  // Preserve Origin so the API can enforce its configured browser boundary.
  return headers;
}

function allowedOrigin(request) {
  if (!request.headers.origin) return true;
  try {
    const origin = new URL(request.headers.origin);
    return origin.protocol === "http:" && origin.port === String(gatewayPort) && domainTargets.has(origin.hostname);
  } catch { return false; }
}

const server = http.createServer(async (request, response) => {
  if (!resolveTarget(request)) {
    response.writeHead(421, { "content-type": "application/json" }); response.end(JSON.stringify({ error: "Unknown local DentMarket domain" })); return;
  }
  if (!allowedOrigin(request)) {
    response.writeHead(403, { "content-type": "application/json" }); response.end(JSON.stringify({ error: "Origin is not allowed by the local profile" })); return;
  }
  const pathname = new URL(request.url ?? "/", "http://gateway.local").pathname;
  if (pathname === "/__gateway/health") {
    const targets = [apiTarget, ...new Map([...domainTargets.values()].map(target => [target.port, target])).values()];
    const checks = await Promise.all(targets.map(async target => {
      try {
        const check = await fetch(`http://${target.host}:${target.port}${target === apiTarget ? "/api/health/ready" : target.name === "Landing" ? "/login" : "/"}`, { method: target === apiTarget ? "GET" : "HEAD", signal: AbortSignal.timeout(3000) });
        return { name: target.name, ready: check.ok };
      } catch { return { name: target.name, ready: false }; }
    }));
    const ready = checks.every(check => check.ready);
    response.writeHead(ready ? 200 : 503, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(JSON.stringify({ ...gatewayDescription(), status: ready ? "ready" : "starting", checks }));
    return;
  }

  const target = resolveTarget(request);
  if (!target) {
    response.writeHead(421, { "content-type": "application/json; charset=utf-8" });
    response.end(
      JSON.stringify({
        error: "Unknown local DentMarket domain",
        allowedHosts: [...domainTargets.keys()],
      }),
    );
    return;
  }

  const proxyRequest = http.request(
    {
      hostname: target.host,
      port: target.port,
      method: request.method,
      path: request.url,
      headers: proxyHeaders(request, target),
    },
    (proxyResponse) => {
      response.writeHead(proxyResponse.statusCode ?? 502, proxyResponse.headers);
      proxyResponse.pipe(response);
    },
  );

  proxyRequest.on("error", (error) => {
    if (response.headersSent) {
      response.destroy(error);
      return;
    }
    response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
    response.end(
      JSON.stringify({
        error: `${target.name} is not ready`,
      }),
    );
  });
  proxyRequest.setTimeout(target === apiTarget ? 20000 : 60000, () => proxyRequest.destroy(new Error("Upstream timeout")));
  request.on("aborted", () => proxyRequest.destroy());
  request.pipe(proxyRequest);
});

server.on("upgrade", (request, socket, head) => {
  const target = resolveTarget(request);
  if (!target || target === apiTarget || !allowedOrigin(request)) {
    socket.end("HTTP/1.1 421 Misdirected Request\r\nConnection: close\r\n\r\n");
    return;
  }

  const upstream = net.connect(target.port, target.host, () => {
    const headerLines = Object.entries(request.headers).flatMap(([name, value]) => {
      if (value === undefined) return [];
      return (Array.isArray(value) ? value : [value]).map(
        (item) => `${name}: ${item}`,
      );
    });
    headerLines.push(`x-forwarded-host: ${request.headers.host ?? ""}`);
    headerLines.push(`x-forwarded-port: ${gatewayPort}`);
    headerLines.push("x-forwarded-proto: http");
    upstream.write(
      `${request.method ?? "GET"} ${request.url ?? "/"} HTTP/${request.httpVersion}\r\n${headerLines.join("\r\n")}\r\n\r\n`,
    );
    if (head.length > 0) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });

  upstream.on("error", () => {
    if (!socket.destroyed) {
      socket.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
    }
  });
  socket.on("error", () => upstream.destroy());
});

server.listen(gatewayPort, gatewayHost, () => {
  const routes = gatewayDescription().routes;
  console.log(`DentMarket dev gateway is listening on ${gatewayHost}:${gatewayPort}; readiness: /__gateway/health`);
  console.log(`Landing:     ${routes.landing}`);
  console.log(`Marketplace: ${routes.marketplace}`);
  console.log(`Supplier:    ${routes.supplier}`);
  console.log(`Admin:       ${routes.admin}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
