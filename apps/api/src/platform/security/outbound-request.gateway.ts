import { Injectable } from "@nestjs/common";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RESPONSE_LIMIT_BYTES = 2 * 1024 * 1024;
const MAX_TIMEOUT_MS = 60_000;
const MAX_RESPONSE_LIMIT_BYTES = 4 * 1024 * 1024;
const MAX_REDIRECTS = 3;

type ResolvedAddress = { address: string; family: 4 | 6 };

export type OutboundRequestOptions = {
  method?: "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
  allowedHosts?: string[];
};

export class OutboundRequestPolicyError extends Error {
  constructor(message = "Outbound destination is not allowed") {
    super(message);
    this.name = "OutboundRequestPolicyError";
  }
}

export class OutboundRequestTimeoutError extends Error {
  constructor() {
    super("Outbound request timed out");
    this.name = "OutboundRequestTimeoutError";
  }
}

export class OutboundResponseLimitError extends Error {
  constructor() {
    super("Outbound response exceeded the allowed size");
    this.name = "OutboundResponseLimitError";
  }
}

export class OutboundNetworkError extends Error {
  constructor() {
    super("Outbound network request failed");
    this.name = "OutboundNetworkError";
  }
}

export class OutboundHttpResponse {
  constructor(
    readonly status: number,
    readonly headers: Headers,
    private readonly bodyText: string,
  ) {}

  get ok() {
    return this.status >= 200 && this.status < 300;
  }

  async text() {
    return this.bodyText;
  }
}

const blockedIpv4 = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedIpv4.addSubnet(network, prefix, "ipv4");
}

const blockedIpv6 = new BlockList();
for (const [network, prefix] of [
  ["2001:0::", 32],
  ["2001:2::", 48],
  ["2001:10::", 28],
  ["2001:20::", 28],
  ["2001:db8::", 32],
  ["2002::", 16],
] as const) {
  blockedIpv6.addSubnet(network, prefix, "ipv6");
}

function normalizedHostname(url: URL) {
  return url.hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
}

export function isPublicOutboundAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return !blockedIpv4.check(address, "ipv4");
  if (family !== 6) return false;

  const firstHextet = Number.parseInt(address.split(":")[0] ?? "", 16);
  if (
    !Number.isFinite(firstHextet) ||
    firstHextet < 0x2000 ||
    firstHextet > 0x3fff
  )
    return false;
  return !blockedIpv6.check(address, "ipv6");
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
) {
  return Number.isFinite(value)
    ? Math.min(maximum, Math.max(1, Math.trunc(value!)))
    : fallback;
}

function responseHeaders(
  headers: Record<string, string | string[] | undefined>,
) {
  const result = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value))
      for (const item of value) result.append(name, item);
    else if (value !== undefined) result.set(name, value);
  }
  return result;
}

export function normalizeOutboundRequestHeaders(
  headers: Record<string, string> | undefined,
) {
  const result: Record<string, string> = {};
  const forbidden = new Set([
    "connection",
    "content-length",
    "expect",
    "host",
    "keep-alive",
    "proxy-authorization",
    "proxy-connection",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
  ]);
  for (const [name, value] of Object.entries(headers ?? {})) {
    const normalized = name.toLowerCase();
    if (forbidden.has(normalized)) throw new OutboundRequestPolicyError();
    result[normalized] = value;
  }
  result.accept ??= "application/json";
  result["accept-encoding"] = "identity";
  return result;
}

function safeNetworkError(error: Error) {
  return error instanceof OutboundRequestPolicyError ||
    error instanceof OutboundRequestTimeoutError ||
    error instanceof OutboundResponseLimitError
    ? error
    : new OutboundNetworkError();
}

@Injectable()
export class OutboundRequestGateway {
  protected async resolveHost(hostname: string): Promise<ResolvedAddress[]> {
    if (isIP(hostname)) {
      return [{ address: hostname, family: isIP(hostname) as 4 | 6 }];
    }
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    return addresses.map(({ address, family }) => ({
      address,
      family: family as 4 | 6,
    }));
  }

  private async authorize(url: URL, options: OutboundRequestOptions) {
    if (url.protocol !== "https:" || url.username || url.password)
      throw new OutboundRequestPolicyError();
    if ((url.port || "443") !== "443") throw new OutboundRequestPolicyError();

    const hostname = normalizedHostname(url);
    if (!hostname) throw new OutboundRequestPolicyError();
    const allowedHosts = options.allowedHosts?.map((host) =>
      host.replace(/\.$/, "").toLowerCase(),
    );
    if (allowedHosts && !allowedHosts.includes(hostname))
      throw new OutboundRequestPolicyError();

    const resolveTimeoutMs = boundedInteger(
      options.timeoutMs,
      DEFAULT_TIMEOUT_MS,
      MAX_TIMEOUT_MS,
    );
    let timeout: NodeJS.Timeout | undefined;
    let addresses: ResolvedAddress[];
    try {
      addresses = await Promise.race([
        this.resolveHost(hostname),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new OutboundRequestTimeoutError()),
            resolveTimeoutMs,
          );
        }),
      ]).finally(() => {
        if (timeout) clearTimeout(timeout);
      });
    } catch (error) {
      throw safeNetworkError(
        error instanceof Error ? error : new OutboundNetworkError(),
      );
    }
    if (
      addresses.length === 0 ||
      addresses.some(({ address }) => !isPublicOutboundAddress(address))
    ) {
      throw new OutboundRequestPolicyError();
    }
    return { hostname, address: addresses[0] };
  }

  protected dispatch(
    url: URL,
    target: { hostname: string; address: ResolvedAddress },
    options: OutboundRequestOptions,
  ) {
    const timeoutMs = boundedInteger(
      options.timeoutMs,
      DEFAULT_TIMEOUT_MS,
      MAX_TIMEOUT_MS,
    );
    const maxResponseBytes = boundedInteger(
      options.maxResponseBytes,
      DEFAULT_RESPONSE_LIMIT_BYTES,
      MAX_RESPONSE_LIMIT_BYTES,
    );

    return new Promise<OutboundHttpResponse>((resolve, reject) => {
      let settled = false;
      let timeout: NodeJS.Timeout | undefined;
      const finishReject = (error: Error) => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        reject(error);
      };
      const request = httpsRequest(
        {
          protocol: "https:",
          hostname: target.hostname,
          port: 443,
          method: options.method ?? "GET",
          path: `${url.pathname}${url.search}`,
          headers: normalizeOutboundRequestHeaders(options.headers),
          family: target.address.family,
          servername: isIP(target.hostname) ? undefined : target.hostname,
          lookup: (_hostname, _lookupOptions, callback) =>
            callback(null, target.address.address, target.address.family),
        },
        (response) => {
          const encoding = String(
            response.headers["content-encoding"] ?? "identity",
          ).toLowerCase();
          if (encoding !== "identity") {
            response.resume();
            finishReject(
              new OutboundRequestPolicyError(
                "Compressed outbound responses are not accepted",
              ),
            );
            return;
          }
          const contentLength = Number(response.headers["content-length"] ?? 0);
          if (
            Number.isFinite(contentLength) &&
            contentLength > maxResponseBytes
          ) {
            response.resume();
            finishReject(new OutboundResponseLimitError());
            return;
          }

          const chunks: Buffer[] = [];
          let received = 0;
          response.on("data", (chunk: Buffer | string) => {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            received += buffer.length;
            if (received > maxResponseBytes) {
              finishReject(new OutboundResponseLimitError());
              request.destroy();
              response.destroy();
              return;
            }
            chunks.push(buffer);
          });
          response.on("error", (error) =>
            finishReject(safeNetworkError(error)),
          );
          response.on("end", () => {
            if (settled) return;
            settled = true;
            if (timeout) clearTimeout(timeout);
            resolve(
              new OutboundHttpResponse(
                response.statusCode ?? 502,
                responseHeaders(response.headers),
                Buffer.concat(chunks).toString("utf8"),
              ),
            );
          });
        },
      );
      timeout = setTimeout(
        () => request.destroy(new OutboundRequestTimeoutError()),
        timeoutMs,
      );
      request.on("error", (error) => finishReject(safeNetworkError(error)));
      if (options.body !== undefined) request.write(options.body);
      request.end();
    });
  }

  async request(input: URL | string, options: OutboundRequestOptions = {}) {
    let url: URL;
    try {
      url = input instanceof URL ? new URL(input) : new URL(input);
    } catch {
      throw new OutboundRequestPolicyError();
    }

    let method = options.method ?? "GET";
    let body = options.body;
    const deadline =
      Date.now() +
      boundedInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) throw new OutboundRequestTimeoutError();
      const target = await this.authorize(url, {
        ...options,
        timeoutMs: remainingMs,
      });
      const dispatchRemainingMs = deadline - Date.now();
      if (dispatchRemainingMs <= 0) throw new OutboundRequestTimeoutError();
      const response = await this.dispatch(url, target, {
        ...options,
        timeoutMs: dispatchRemainingMs,
        method,
        body,
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) return response;

      const location = response.headers.get("location");
      if (!location || redirect === MAX_REDIRECTS)
        throw new OutboundRequestPolicyError(
          "Outbound redirect is not allowed",
        );
      let next: URL;
      try {
        next = new URL(location, url);
      } catch {
        throw new OutboundRequestPolicyError(
          "Outbound redirect is not allowed",
        );
      }
      if (next.origin !== url.origin)
        throw new OutboundRequestPolicyError(
          "Cross-origin outbound redirect is not allowed",
        );
      if (!["GET", "HEAD"].includes(method))
        throw new OutboundRequestPolicyError(
          "Outbound write redirect is not allowed",
        );
      if (response.status === 303) {
        method = "GET";
        body = undefined;
      }
      url = next;
    }
    throw new OutboundRequestPolicyError("Outbound redirect is not allowed");
  }
}
