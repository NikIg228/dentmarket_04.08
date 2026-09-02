import { parseConnectorAgentJobResult } from "@marketplace/schemas";
import type {
  ConnectorAgentJobType,
  ConnectorCatalogResult,
  ConnectorInventoryResult,
  ConnectorOrderResult,
  ConnectorPriceResult,
  ConnectorReservationResult,
} from "@marketplace/schemas";

export type OneCAgentJob = {
  id: string;
  type: ConnectorAgentJobType;
  trigger: string;
  payload: Record<string, unknown> | null;
  cursor: Record<string, unknown> | null;
  attempt: number;
  maxAttempts: number;
  correlationId: string | null;
};

export type OneCAgentHttp = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type OneCAgentOptions = {
  baseUrl: string;
  agentId: string;
  accessToken?: string;
  fetchImpl?: OneCAgentHttp;
};

export type OneCSourceAdapter = {
  testConnection(): Promise<{ ok?: boolean; message?: string; data?: Record<string, unknown> }>;
  discover(): Promise<{ ok?: boolean; message?: string; data?: Record<string, unknown> }>;
  pullCatalog(cursor: Record<string, unknown> | null): Promise<ConnectorCatalogResult>;
  pullPrices(cursor: Record<string, unknown> | null): Promise<ConnectorPriceResult>;
  pullInventory(cursor: Record<string, unknown> | null): Promise<ConnectorInventoryResult>;
  exportOrder(payload: Record<string, unknown>): Promise<ConnectorOrderResult>;
  createReservation(payload: Record<string, unknown>): Promise<ConnectorReservationResult>;
  releaseReservation(payload: Record<string, unknown>): Promise<ConnectorReservationResult>;
};

export class OneCAgentExecutionError extends Error {
  constructor(message: string, public readonly retryable: boolean) {
    super(message);
    this.name = "OneCAgentExecutionError";
  }
}

export function safeOneCAgentError(error: unknown) {
  const message = error instanceof Error ? error.message : "1C source execution failed";
  return message
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]")
    .replace(/\b(password|token|secret|api[-_ ]?key|authorization)(\s*[=:]\s*)[^\s,;]+/gi, "$1$2[REDACTED]")
    .slice(0, 2_000);
}

export class OneCAgentApi {
  private accessToken?: string;
  private readonly baseUrl: string;
  private readonly agentId: string;
  private readonly fetchImpl: OneCAgentHttp;

  constructor(options: OneCAgentOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.agentId = options.agentId;
    this.accessToken = options.accessToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async enroll(enrollmentToken: string, version: string, capabilities: string[]) {
    const result = await this.request<{ agentId: string; accessToken: string; minimumSupportedVersion: string | null; heartbeatIntervalSeconds: number; claimIntervalSeconds: number }>(`/connector-agents/${encodeURIComponent(this.agentId)}/enroll`, {
      method: "POST",
      body: JSON.stringify({ enrollmentToken, version, capabilities }),
      includeAuth: false,
    });
    this.accessToken = result.accessToken;
    return result;
  }

  heartbeat(version: string, capabilities: string[], lastError?: string | null) {
    return this.request<{ accepted: boolean; serverTime: string }>(`/connector-agents/${encodeURIComponent(this.agentId)}/heartbeat`, {
      method: "POST",
      body: JSON.stringify({ version, capabilities, lastError: lastError ?? null }),
    });
  }

  claim() {
    return this.request<{ job: OneCAgentJob | null }>(`/connector-agents/${encodeURIComponent(this.agentId)}/jobs/claim`, { method: "POST" });
  }

  complete(jobId: string, result: Record<string, unknown>, cursor?: Record<string, unknown> | null) {
    return this.request<Record<string, unknown>>(`/connector-agents/${encodeURIComponent(this.agentId)}/jobs/${encodeURIComponent(jobId)}/complete`, {
      method: "POST",
      body: JSON.stringify({ result, cursor: cursor ?? null }),
    });
  }

  fail(jobId: string, error: string, retryable = true) {
    return this.request<Record<string, unknown>>(`/connector-agents/${encodeURIComponent(this.agentId)}/jobs/${encodeURIComponent(jobId)}/fail`, {
      method: "POST",
      body: JSON.stringify({ error, retryable }),
    });
  }

  private async request<T>(path: string, options: RequestInit & { includeAuth?: boolean }) {
    const headers = new Headers(options.headers);
    headers.set("content-type", "application/json");
    if (options.includeAuth !== false && this.accessToken) headers.set("authorization", `Bearer ${this.accessToken}`);
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, { ...options, headers });
    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = { message: "Agent API returned invalid JSON" }; }
    }
    if (!response.ok) throw new Error(typeof payload === "object" && payload && "message" in payload ? String(payload.message) : `Agent API returned HTTP ${response.status}`);
    return payload as T;
  }
}

export class OneCAgentRunner {
  constructor(private readonly api: OneCAgentApi, private readonly source: OneCSourceAdapter) {}

  async runOnce() {
    const claimed = await this.api.claim();
    if (!claimed.job) return { status: "IDLE" as const };
    const job = claimed.job;
    try {
      const result = await this.execute(job);
      await this.api.complete(job.id, result, this.cursor(result));
      return { status: "COMPLETED" as const, jobId: job.id, type: job.type };
    } catch (error) {
      const message = safeOneCAgentError(error);
      const retryable = error instanceof OneCAgentExecutionError ? error.retryable : true;
      await this.api.fail(job.id, message, retryable);
      return { status: "FAILED" as const, jobId: job.id, type: job.type, message };
    }
  }

  private async execute(job: OneCAgentJob): Promise<Record<string, unknown>> {
    const payload = job.payload ?? {};
    let result: unknown;
    switch (job.type) {
      case "TEST_CONNECTION": result = await this.source.testConnection(); break;
      case "DISCOVER": result = await this.source.discover(); break;
      case "CATALOG_SYNC": result = await this.source.pullCatalog(job.cursor); break;
      case "PRICE_SYNC": result = await this.source.pullPrices(job.cursor); break;
      case "INVENTORY_SYNC": result = await this.source.pullInventory(job.cursor); break;
      case "ORDER_EXPORT": result = await this.source.exportOrder(payload); break;
      case "RESERVATION_CREATE": result = await this.source.createReservation(payload); break;
      case "RESERVATION_RELEASE": result = await this.source.releaseReservation(payload); break;
      default: throw new OneCAgentExecutionError(`Unsupported 1C Agent job type: ${job.type}`, false);
    }

    const parsed = parseConnectorAgentJobResult(job.type, result);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const detail = issue ? `${issue.path.join(".") || "result"}: ${issue.message}` : "invalid result";
      throw new OneCAgentExecutionError(`1C source result does not match the ${job.type} contract (${detail})`, false);
    }
    return parsed.data as Record<string, unknown>;
  }

  private cursor(result: Record<string, unknown>) {
    return result.nextCursor && typeof result.nextCursor === "object" && !Array.isArray(result.nextCursor) ? result.nextCursor as Record<string, unknown> : null;
  }
}
