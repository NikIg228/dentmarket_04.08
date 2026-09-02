import { Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { browserEdsSignatureSchema, signatureGatewayVerificationSchema, type BrowserEdsSignatureInput, type SignatureGatewayVerification } from "@marketplace/schemas";
import { environment } from "../../platform/config/environment";
import { OutboundRequestGateway } from "../../platform/security/outbound-request.gateway";

type VerificationRequest = BrowserEdsSignatureInput & {
  externalSessionId: string;
  expectedSubjectBin: string;
};

@Injectable()
export class EdsSignatureVerificationService {
  constructor(private readonly outbound: OutboundRequestGateway) {}

  async verifyDetachedCms(input: VerificationRequest) {
    const parsedInput = browserEdsSignatureSchema.safeParse(input);
    if (!parsedInput.success) throw new UnauthorizedException("EDS verification request is invalid");
    if (!input.externalSessionId || !/^\d{12}$/.test(input.expectedSubjectBin)) {
      throw new UnauthorizedException("EDS verification context is invalid");
    }

    const config = environment();
    if (!config.SIGNATURE_GATEWAY_URL) {
      throw new ServiceUnavailableException("EDS verification gateway is not configured");
    }

    let gatewayUrl: URL;
    try {
      gatewayUrl = new URL(config.SIGNATURE_GATEWAY_URL);
    } catch {
      throw new ServiceUnavailableException("EDS verification gateway URL is invalid");
    }

    let response;
    try {
      response = await this.outbound.request(`${config.SIGNATURE_GATEWAY_URL.replace(/\/$/, "")}/verify`, {
        method: "POST",
        allowedHosts: [gatewayUrl.hostname],
        headers: {
          "Content-Type": "application/json",
          ...(config.SIGNATURE_GATEWAY_TOKEN ? { Authorization: `Bearer ${config.SIGNATURE_GATEWAY_TOKEN}` } : {}),
        },
        body: JSON.stringify({
          signatureId: parsedInput.data.signatureId,
          externalSessionId: input.externalSessionId,
          signedDocumentChecksum: parsedInput.data.dataChecksumSha256,
          signedContainerBase64: parsedInput.data.signedContainerBase64,
          expectedSubjectBin: input.expectedSubjectBin,
        }),
        timeoutMs: 30_000,
        maxResponseBytes: 1_000_000,
      });
    } catch {
      throw new ServiceUnavailableException("EDS verification gateway is unavailable");
    }

    const responseText = await response.text();
    let payload: unknown;
    try {
      payload = responseText ? JSON.parse(responseText) : null;
    } catch {
      throw new ServiceUnavailableException("EDS verification gateway returned invalid JSON");
    }
    if (!response.ok) throw new UnauthorizedException("EDS signature was rejected by the verification gateway");

    const verification = signatureGatewayVerificationSchema.safeParse(payload);
    if (!verification.success) throw new UnauthorizedException("EDS verification evidence is incomplete");
    return this.assertVerifiedEvidence(verification.data, parsedInput.data.dataChecksumSha256, input.expectedSubjectBin);
  }

  assertVerifiedEvidence(evidence: SignatureGatewayVerification, expectedChecksum: string, expectedSubjectBin: string, now = new Date()) {
    const parsed = signatureGatewayVerificationSchema.safeParse(evidence);
    if (!parsed.success) throw new UnauthorizedException("EDS verification evidence is incomplete");
    if (parsed.data.signedDocumentChecksum.toLowerCase() !== expectedChecksum.toLowerCase()) throw new UnauthorizedException("Verified EDS checksum does not match the document");
    if (parsed.data.certificate.subjectBin !== expectedSubjectBin) throw new UnauthorizedException("Verified EDS certificate BIN does not match the signer organization");
    const validFrom = new Date(parsed.data.certificate.validFrom);
    const validTo = new Date(parsed.data.certificate.validTo);
    if (!Number.isFinite(validFrom.getTime()) || !Number.isFinite(validTo.getTime()) || validFrom > now || validTo <= now) throw new UnauthorizedException("Verified EDS certificate is outside its validity period");
    return parsed.data;
  }
}
