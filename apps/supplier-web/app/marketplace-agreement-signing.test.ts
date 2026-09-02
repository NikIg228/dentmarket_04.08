import { describe, expect, it } from "vitest";
import { NcalayerError } from "@marketplace/eds-client";
import { agreementSigningMode, agreementSigningStep, signingErrorMessage } from "./marketplace-agreement-signing";

describe("marketplace agreement signing flow", () => {
  it("uses the remote gateway on mobile and never falls back to local NCALayer", () => {
    const mode = agreementSigningMode("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile");
    expect(mode).toBe("REMOTE_GATEWAY");
    expect(() => agreementSigningStep(mode, { signature: { id: "signature-1", status: "SESSION_CREATED" } }))
      .toThrow("не вернул ссылку");
  });

  it("uses an NCALayer session on desktop", () => {
    const mode = agreementSigningMode("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    expect(agreementSigningStep(mode, { signature: { id: "signature-1", status: "SESSION_CREATED" } }))
      .toEqual({ kind: "local", signatureId: "signature-1" });
  });

  it("turns NCALayer connection errors into a recoverable instruction", () => {
    expect(signingErrorMessage(new NcalayerError("connection failed", "NCALAYER_CONNECTION_FAILED")))
      .toContain("Запустите приложение NCALayer");
  });
});
