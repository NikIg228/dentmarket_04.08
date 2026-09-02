import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import type { z } from "zod";
import { browserEdsSignatureSchema, signatureGatewayCallbackSchema, type CompleteDocumentSignatureInput } from "@marketplace/schemas";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { environment } from "../../platform/config/environment";
import { PrismaService } from "../../platform/prisma/prisma.service";
import { DocumentsService } from "../documents/documents.service";
import { MarketplaceAgreementsService } from "./marketplace-agreements.service";
import { BuyerSupplierAgreementsService } from "../buyer-supplier-agreements/buyer-supplier-agreements.service";
import { EdsSignatureVerificationService } from "./eds-signature-verification.service";

type CallbackInput = z.infer<typeof signatureGatewayCallbackSchema>;
type SignatureWithRelations = Prisma.DocumentSignatureGetPayload<{ include: { document: { include: { marketplaceAgreement: true; buyerSupplierAgreement: true } }; signerOrganization: true } }>;

export function verifySignatureCallbackEnvelope(input: { rawBody: Buffer; eventId: string; timestamp: string; signature: string; secret: string; toleranceSeconds: number; now?: number }) {
  if (!/^\d{10,13}$/.test(input.timestamp)) throw new UnauthorizedException("Signature callback timestamp is invalid");
  const milliseconds = input.timestamp.length === 13 ? Number(input.timestamp) : Number(input.timestamp) * 1_000;
  const now = input.now ?? Date.now();
  if (!Number.isSafeInteger(milliseconds) || Math.abs(now - milliseconds) > input.toleranceSeconds * 1_000) throw new UnauthorizedException("Signature callback timestamp is outside the allowed window");
  if (!/^[A-Za-z0-9_.:-]{8,240}$/.test(input.eventId)) throw new UnauthorizedException("Signature callback event ID is invalid");
  const expected = createHmac("sha256", input.secret).update(`${input.timestamp}.`).update(input.rawBody).digest("hex");
  const provided = input.signature.replace(/^sha256=/i, "").toLowerCase();
  const left = Buffer.from(expected); const right = Buffer.from(provided);
  if (left.length !== right.length || !timingSafeEqual(left, right)) throw new UnauthorizedException("Signature callback HMAC is invalid");
  return { payloadHash: createHash("sha256").update(input.rawBody).digest("hex"), expiresAt: new Date(now + 24 * 60 * 60_000) };
}

export function requireMatchingSignerOrganization(
  signerOrganization: { bin: string } | null,
  certificateSubjectBin: string,
) {
  if (!signerOrganization || signerOrganization.bin !== certificateSubjectBin) {
    throw new UnauthorizedException("EDS certificate BIN does not match the signer organization");
  }
}

@Injectable()
export class SignatureCallbacksService {
  constructor(private readonly prisma: PrismaService, private readonly documents: DocumentsService, private readonly agreements: MarketplaceAgreementsService, private readonly buyerSupplierAgreements: BuyerSupplierAgreementsService, private readonly verifier: EdsSignatureVerificationService) {}

  private verify(rawBody: Buffer, eventId: string, timestamp: string, signature: string) {
    const config = environment();
    if (!config.SIGNATURE_CALLBACK_SECRET) throw new ServiceUnavailableException("Signature callback secret is not configured");
    return verifySignatureCallbackEnvelope({ rawBody, eventId, timestamp, signature, secret: config.SIGNATURE_CALLBACK_SECRET, toleranceSeconds: config.WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS });
  }

  async process(input: CallbackInput, rawBody: Buffer, headers: { eventId: string; timestamp: string; signature: string }) {
    const verified = this.verify(rawBody, headers.eventId, headers.timestamp, headers.signature);
    const idempotencyKey = verified.payloadHash;
    const existing = await this.prisma.idempotencyRecord.findUnique({ where: { scope_key: { scope: "signature-gateway-callback", key: idempotencyKey } } });
    let idempotencyRecordId = existing?.id;
    if (existing?.responseCode === 200) {
      await this.prisma.securityEvent.create({ data: { severity: "HIGH", type: "signature.callback.replay", fingerprint: idempotencyKey, metadata: { gatewayEventId: headers.eventId, payloadHash: verified.payloadHash } } });
      throw new ConflictException("Signature callback replay was rejected");
    }
    if (!existing) {
      try {
        const created = await this.prisma.idempotencyRecord.create({ data: { scope: "signature-gateway-callback", key: idempotencyKey, requestHash: verified.payloadHash, responseCode: null, expiresAt: verified.expiresAt } });
        idempotencyRecordId = created.id;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
        const raced = await this.prisma.idempotencyRecord.findUnique({ where: { scope_key: { scope: "signature-gateway-callback", key: idempotencyKey } } });
        if (!raced) throw error;
        if (raced.responseCode === 200) throw new ConflictException("Signature callback replay was rejected");
        idempotencyRecordId = raced.id;
      }
    }
    if (!idempotencyRecordId) throw new ConflictException("Signature callback idempotency state is unavailable");
    try {
    const signature = await this.loadSignature(input.signatureId);
    if (!signature || signature.method !== "EDS") throw new NotFoundException("EDS signature session not found");
    if (signature.externalSessionId !== input.externalSessionId) throw new UnauthorizedException("Signature callback session does not match");
    if (signature.document.checksumSha256?.toLowerCase() !== input.signedDocumentChecksum.toLowerCase()) throw new UnauthorizedException("Signed document checksum does not match the immutable document");
    requireMatchingSignerOrganization(signature.signerOrganization, input.certificate.subjectBin);
    const now = new Date();
    const certificateValidFrom = new Date(input.certificate.validFrom); const certificateValidTo = new Date(input.certificate.validTo);
    if (certificateValidFrom > now || certificateValidTo <= now) throw new UnauthorizedException("EDS certificate is outside its validity period");
    if (input.status === "SIGNED" && !input.externalSignatureId) throw new UnauthorizedException("External signature ID is required for a signed callback");
    const verification = input.status === "SIGNED" ? this.verifier.assertVerifiedEvidence(input.verification!, input.signedDocumentChecksum, input.certificate.subjectBin) : null;
    if (verification && input.signatureHash && input.signatureHash !== verification.signatureHash) throw new UnauthorizedException("Signature hash does not match gateway verification evidence");
    const context = { actorId: signature.signerUserId ?? signature.signerOrganizationId!, organizationId: signature.signerOrganizationId! };
    const result = await this.completeVerified(signature, { status: input.status, externalSignatureId: input.externalSignatureId, signatureHash: verification?.signatureHash ?? input.signatureHash, rejectionReason: input.rejectionReason, evidence: { ...input.evidence, gatewayEventId: headers.eventId, certificate: input.certificate, verification, payloadHash: verified.payloadHash } }, context, headers.eventId);
    await this.prisma.idempotencyRecord.update({ where: { id: idempotencyRecordId }, data: { responseCode: 200, responseBody: { signatureId: signature.id, status: result.signature.status, documentId: result.document.id } as Prisma.InputJsonValue } });
    return { accepted: true, signature: result.signature, document: result.document };
    } catch (error) {
      await this.prisma.idempotencyRecord.deleteMany({ where: { id: idempotencyRecordId, responseCode: null } }).catch(() => undefined);
      throw error;
    }
  }

  async processBrowser(input: z.infer<typeof browserEdsSignatureSchema>, context: { actorId: string; organizationId: string }) {
    const signature = await this.loadSignature(input.signatureId);
    if (!signature || signature.method !== "EDS") throw new NotFoundException("EDS signature session not found");
    if (signature.signerOrganizationId !== context.organizationId || !signature.signerOrganization) throw new UnauthorizedException("EDS signature session does not belong to the active organization");
    if (!signature.externalSessionId) throw new ConflictException("EDS signature session has no external session ID");
    if (signature.document.checksumSha256?.toLowerCase() !== input.dataChecksumSha256.toLowerCase()) throw new UnauthorizedException("Signed document checksum does not match the immutable document");
    const verification = await this.verifier.verifyDetachedCms({ ...input, externalSessionId: signature.externalSessionId, expectedSubjectBin: signature.signerOrganization.bin });
    const result = await this.completeVerified(signature, { status: "SIGNED", externalSignatureId: verification.externalSignatureId, signatureHash: verification.signatureHash, evidence: { provider: "ncalayer-browser", verification } }, context, `browser:${signature.id}`);
    return { accepted: true, signature: result.signature, document: result.document, verification: { certificate: verification.certificate, revocationStatus: verification.revocationStatus } };
  }

  private async loadSignature(signatureId: string): Promise<SignatureWithRelations | null> {
    return this.prisma.documentSignature.findUnique({ where: { id: signatureId }, include: { document: { include: { marketplaceAgreement: true, buyerSupplierAgreement: true } }, signerOrganization: true } });
  }

  private async completeVerified(signature: SignatureWithRelations, input: CompleteDocumentSignatureInput, context: { actorId: string; organizationId: string }, eventId: string) {
    const result = await this.documents.completeSignature(signature.id, input, context, true);
    if (signature.document.marketplaceAgreement) await this.agreements.reconcile(signature.document.marketplaceAgreement.id);
    if (signature.document.buyerSupplierAgreement) await this.buyerSupplierAgreements.reconcile(signature.document.buyerSupplierAgreement.id);
    const provider = input.evidence && typeof input.evidence === "object" && "provider" in input.evidence && typeof input.evidence.provider === "string" ? input.evidence.provider : "unknown";
    await this.prisma.securityEvent.create({ data: { severity: "INFO", type: "signature.callback.verified", actorId: context.actorId, organizationId: context.organizationId, sessionId: signature.id, fingerprint: eventId, metadata: { documentId: signature.documentId, status: input.status, provider } } });
    return result;
  }
}
