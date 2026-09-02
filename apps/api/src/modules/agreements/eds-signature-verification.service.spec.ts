import { describe, expect, it, vi } from "vitest";
import type { SignatureGatewayVerification } from "@marketplace/schemas";
import { OutboundRequestGateway } from "../../platform/security/outbound-request.gateway";
import { EdsSignatureVerificationService } from "./eds-signature-verification.service";

const verified: SignatureGatewayVerification = {
  verified: true,
  signatureVerified: true,
  certificateChainVerified: true,
  revocationStatus: "GOOD",
  signedDocumentChecksum: "a".repeat(64),
  signatureHash: "b".repeat(64),
  externalSignatureId: "signature-123456",
  certificate: {
    subjectBin: "123456789012",
    issuer: "NCA",
    serialNumber: "serial-1",
    validFrom: "2026-01-01T00:00:00.000Z",
    validTo: "2027-01-01T00:00:00.000Z",
  },
  provider: "nca-verifier",
  evidence: {},
};

describe("EDS signature verification evidence", () => {
  it("accepts only verified, chained and non-revoked evidence for the expected document and BIN", () => {
    const service = new EdsSignatureVerificationService({ request: vi.fn() } as unknown as OutboundRequestGateway);
    expect(service.assertVerifiedEvidence(verified, "a".repeat(64), "123456789012", new Date("2026-08-22T00:00:00.000Z"))).toEqual(verified);
    expect(() => service.assertVerifiedEvidence(verified, "c".repeat(64), "123456789012", new Date("2026-08-22T00:00:00.000Z"))).toThrow("checksum");
    expect(() => service.assertVerifiedEvidence(verified, "a".repeat(64), "999999999999", new Date("2026-08-22T00:00:00.000Z"))).toThrow("BIN");
  });
});
