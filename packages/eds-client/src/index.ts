export type NcalayerSocketMessage = {
  data: string;
};

export type NcalayerWebSocket = {
  readonly readyState?: number;
  onopen: (() => void) | null;
  onmessage: ((event: NcalayerSocketMessage) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(): void;
};

export type NcalayerWebSocketFactory = (url: string) => NcalayerWebSocket;

export type NcalayerClientOptions = {
  websocketUrl?: string;
  timeoutMs?: number;
  locale?: "kk" | "ru";
  allowedStorages?: string[];
  extKeyUsageOids?: string[];
  webSocketFactory?: NcalayerWebSocketFactory;
};

export type DetachedCmsSigningResult = {
  signedContainerBase64: string;
  dataChecksumSha256: string;
  format: "CMS";
};

type NcalayerResponse = {
  status?: boolean;
  result?: unknown;
  code?: string;
  message?: string;
};

export class NcalayerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "NcalayerError";
  }
}

const DEFAULT_WEBSOCKET_URL = "wss://127.0.0.1:13579/";
const DEFAULT_TIMEOUT_MS = 30_000;
const SIGNING_KEY_USAGE_OID = "1.3.6.1.5.5.7.3.4";

function defaultWebSocketFactory(url: string): NcalayerWebSocket {
  if (typeof WebSocket === "undefined") {
    throw new NcalayerError(
      "NCALayer is available only in a browser with the desktop application installed",
      "NCALAYER_UNAVAILABLE",
    );
  }
  return new WebSocket(url) as unknown as NcalayerWebSocket;
}

function encodeBase64(bytes: Uint8Array) {
  if (typeof btoa === "undefined") {
    throw new NcalayerError("Browser base64 encoder is unavailable", "BASE64_UNAVAILABLE");
  }
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function sha256Hex(bytes: Uint8Array) {
  if (!globalThis.crypto?.subtle) {
    throw new NcalayerError("Web Crypto API is unavailable", "CRYPTO_UNAVAILABLE");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function extractSignature(response: NcalayerResponse) {
  if (typeof response.result === "string" && response.result.length > 0) return response.result;
  if (response.result && typeof response.result === "object" && !Array.isArray(response.result)) {
    const result = response.result as Record<string, unknown>;
    for (const key of ["signature", "cms", "signedData"]) {
      if (typeof result[key] === "string" && result[key].length > 0) return result[key];
    }
  }
  throw new NcalayerError("NCALayer did not return a CMS container", "SIGNATURE_MISSING");
}

export class NcalayerClient {
  private readonly websocketUrl: string;
  private readonly timeoutMs: number;
  private readonly locale: "kk" | "ru";
  private readonly allowedStorages?: string[];
  private readonly extKeyUsageOids: string[];
  private readonly webSocketFactory: NcalayerWebSocketFactory;

  constructor(options: NcalayerClientOptions = {}) {
    this.websocketUrl = options.websocketUrl ?? DEFAULT_WEBSOCKET_URL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.locale = options.locale ?? "ru";
    this.allowedStorages = options.allowedStorages;
    this.extKeyUsageOids = options.extKeyUsageOids ?? [SIGNING_KEY_USAGE_OID];
    this.webSocketFactory = options.webSocketFactory ?? defaultWebSocketFactory;
  }

  async signCmsDetached(data: Uint8Array): Promise<DetachedCmsSigningResult> {
    if (data.byteLength === 0) {
      throw new NcalayerError("Data to sign must not be empty", "EMPTY_SIGNING_DATA");
    }

    const response = await this.invoke({
      module: "kz.gov.pki.knca.basics",
      method: "sign",
      args: {
        ...(this.allowedStorages ? { allowedStorages: this.allowedStorages } : {}),
        format: "cms",
        data: encodeBase64(data),
        signingParams: {
          decode: true,
          encapsulate: false,
          digested: false,
          tsaProfile: {},
        },
        signerParams: {
          extKeyUsageOids: this.extKeyUsageOids,
        },
        locale: this.locale,
      },
    });

    if (response.status !== true) {
      throw new NcalayerError(
        response.message ?? "NCALayer rejected the signing request",
        response.code ?? "SIGNING_REJECTED",
      );
    }

    return {
      signedContainerBase64: extractSignature(response),
      dataChecksumSha256: await sha256Hex(data),
      format: "CMS",
    };
  }

  private invoke(message: Record<string, unknown>): Promise<NcalayerResponse> {
    return new Promise((resolve, reject) => {
      let socket: NcalayerWebSocket | undefined;
      let settled = false;
      const timer = setTimeout(() => {
        finishReject(new NcalayerError("NCALayer request timed out", "NCALAYER_TIMEOUT"));
      }, this.timeoutMs);

      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          socket?.close();
        } catch {
          // The response or error is already determined; close failures are not actionable.
        }
        callback();
      };
      const finishResolve = (response: NcalayerResponse) => finish(() => resolve(response));
      const finishReject = (error: Error) => finish(() => reject(error));

      try {
        socket = this.webSocketFactory(this.websocketUrl);
      } catch (error) {
        finishReject(error instanceof Error ? error : new NcalayerError("NCALayer connection failed", "NCALAYER_CONNECTION_FAILED"));
        return;
      }

      socket.onopen = () => {
        try {
          socket.send(JSON.stringify(message));
        } catch {
          finishReject(new NcalayerError("NCALayer request could not be sent", "NCALAYER_SEND_FAILED"));
        }
      };
      socket.onmessage = (event) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          finishReject(new NcalayerError("NCALayer returned invalid JSON", "NCALAYER_INVALID_RESPONSE"));
          return;
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          finishReject(new NcalayerError("NCALayer returned an invalid response", "NCALAYER_INVALID_RESPONSE"));
          return;
        }
        finishResolve(parsed as NcalayerResponse);
      };
      socket.onerror = () => finishReject(new NcalayerError("NCALayer connection failed", "NCALAYER_CONNECTION_FAILED"));
      socket.onclose = () => finishReject(new NcalayerError("NCALayer connection closed", "NCALAYER_CONNECTION_CLOSED"));
    });
  }
}
