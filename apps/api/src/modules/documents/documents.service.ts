import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { CompleteDocumentSignatureInput, CreateDocumentTemplateInput, CreateDocumentVersionInput, CreateGeneratedDocumentInput, CreateSignatureSessionInput, DocumentQueryInput, GenerateOrderDocumentPackRequest, UploadDocumentInput } from "@marketplace/schemas";
import { Prisma } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { PrismaService } from "../../platform/prisma/prisma.service";
import { ObjectStorageService } from "../../platform/storage/object-storage.service";
import type { SupplierActorContext } from "../suppliers/supplier-access.service";
import { DocumentRendererService } from "./document-renderer.service";
import { SignatureAdapterRegistry } from "./signature-adapter-registry.service";
import { FileUploadPolicyService } from "../../platform/security/file-upload-policy.service";

const orderDocumentDefinitions = [
  {
    kind: "ORDER_SPECIFICATION",
    templateCode: "ORDER_SPECIFICATION_RU",
    number: (orderNumber: string, _shipmentNumber: string) => `SPEC-${orderNumber}`,
    title: (orderNumber: string) => `Спецификация к заказу ${orderNumber}`,
  },
  {
    kind: "INVOICE",
    templateCode: "INVOICE_RU",
    number: (orderNumber: string, _shipmentNumber: string) => `INV-${orderNumber}`,
    title: (orderNumber: string) => `Счёт по заказу ${orderNumber}`,
  },
  {
    kind: "WAYBILL",
    templateCode: "WAYBILL_RU",
    number: (_orderNumber: string, shipmentNumber: string) => `WB-${shipmentNumber}`,
    title: (orderNumber: string) => `Накладная по заказу ${orderNumber}`,
  },
] as const;

function formatMinorUnits(value: { toString(): string }) {
  const minor = BigInt(value.toString());
  const sign = minor < 0n ? "-" : "";
  const absolute = minor < 0n ? -minor : minor;
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}

function formatDestinationAddress(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const address = value as Record<string, unknown>;
  const parts = [address.postalCode, address.city, address.region, address.line1, address.line2]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .map((part) => part.trim());
  return parts.length ? parts.join(", ") : null;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
    private readonly renderer: DocumentRendererService,
    private readonly signatures: SignatureAdapterRegistry,
    private readonly uploads: FileUploadPolicyService,
  ) {}

  private async isOperator(organizationId: string) {
    return Boolean(await this.prisma.organizationCapability.findUnique({ where: { organizationId_capability: { organizationId, capability: "MARKETPLACE_OPERATOR" } } }));
  }

  private async assertOrganizationAccess(organizationId: string, context: SupplierActorContext) {
    if (organizationId !== context.organizationId && !(await this.isOperator(context.organizationId))) throw new ForbiddenException("Organization data belongs to another organization");
    if (!(await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } }))) throw new NotFoundException("Organization not found");
  }

  async templates() {
    return this.prisma.documentTemplate.findMany({ orderBy: [{ code: "asc" }, { version: "desc" }] });
  }

  async createTemplate(input: CreateDocumentTemplateInput, context: SupplierActorContext) {
    if (!(await this.isOperator(context.organizationId))) throw new ForbiddenException("Only the marketplace operator can create document templates");
    return this.prisma.$transaction(async (tx) => {
      const template = await tx.documentTemplate.create({ data: {
        ...input,
        signatureMethods: input.signatureMethods,
        effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : new Date(),
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
        metadata: input.metadata == null ? Prisma.JsonNull : input.metadata as Prisma.InputJsonValue,
      } });
      await tx.auditLog.create({ data: { ...context, action: "document.template.created", entityType: "DocumentTemplate", entityId: template.id, after: { code: template.code, version: template.version, kind: template.kind, format: template.format } } });
      await tx.outboxEvent.create({ data: { aggregateType: "DocumentTemplate", aggregateId: template.id, eventType: "DocumentTemplateCreated", payload: { templateId: template.id, code: template.code, version: template.version } } });
      return template;
    });
  }

  async list(input: DocumentQueryInput, context: SupplierActorContext) {
    if (input.ownerOrganizationId) await this.assertOrganizationAccess(input.ownerOrganizationId, context);
    const operator = await this.isOperator(context.organizationId);
    return this.prisma.document.findMany({
      where: {
        ownerOrganizationId: input.ownerOrganizationId,
        supplierOrderId: input.supplierOrderId,
        checkoutId: input.checkoutId,
        status: input.status,
        kind: input.kind,
        ...(!operator && !input.ownerOrganizationId ? { OR: [
          { ownerOrganizationId: context.organizationId },
          { supplierOrder: { is: { OR: [{ supplierOrganizationId: context.organizationId }, { buyerOrganizationId: context.organizationId }] } } },
        ] } : {}),
      },
      include: { template: true, signatures: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
      take: input.limit,
    });
  }

  async get(documentId: string, context: SupplierActorContext) {
    const document = await this.prisma.document.findUnique({ where: { id: documentId }, include: { template: true, signatures: { orderBy: { createdAt: "asc" } }, supplierOrder: true, shipment: true, previousVersion: true, nextVersions: true } });
    if (!document) throw new NotFoundException("Document not found");
    if (document.ownerOrganizationId !== context.organizationId && document.supplierOrder?.supplierOrganizationId !== context.organizationId && document.supplierOrder?.buyerOrganizationId !== context.organizationId && !(await this.isOperator(context.organizationId))) throw new ForbiddenException("Document belongs to another organization");
    return document;
  }

  async generate(input: CreateGeneratedDocumentInput, context: SupplierActorContext) {
    await this.assertOrganizationAccess(input.ownerOrganizationId, context);
    const now = new Date();
    const template = await this.prisma.documentTemplate.findFirst({ where: { id: input.templateId, status: "ACTIVE", effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] } });
    if (!template) throw new NotFoundException("Active document template not found");
    await this.assertReferences(input.ownerOrganizationId, input.checkoutId, input.supplierOrderId, input.shipmentId);
    const document = await this.prisma.document.create({ data: {
      ownerOrganizationId: input.ownerOrganizationId,
      templateId: template.id,
      checkoutId: input.checkoutId,
      supplierOrderId: input.supplierOrderId,
      shipmentId: input.shipmentId,
      kind: template.kind,
      format: template.format,
      source: "GENERATED",
      status: "GENERATING",
      title: input.title,
      documentNumber: input.documentNumber,
      dataSnapshot: input.data as Prisma.InputJsonValue,
      templateSnapshot: { id: template.id, code: template.code, version: template.version, body: template.templateBody, locale: template.locale, format: template.format },
      requiredSignatureCount: template.requiredSignatureCount,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      metadata: input.metadata == null ? Prisma.JsonNull : input.metadata as Prisma.InputJsonValue,
    } });
    return this.renderAndFinalize(document.id, template.templateBody, input.data, context);
  }

  async upload(input: UploadDocumentInput, context: SupplierActorContext) {
    await this.assertOrganizationAccess(input.ownerOrganizationId, context);
    await this.assertReferences(input.ownerOrganizationId, input.checkoutId, input.supplierOrderId, input.shipmentId);
    const body = this.uploads.decodeBase64(input.contentBase64, 10_000_000);
    const asset = await this.uploads.quarantine({ organizationId: input.ownerOrganizationId, actorId: context.actorId, purpose: "document", fileName: input.fileName, body, allowedKinds: [input.format], maxBytes: 10_000_000 });
    const checksum = asset.checksumSha256;
    const key = asset.storageKey;
    const contentType = asset.detectedMime;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const document = await tx.document.create({ data: {
          ownerOrganizationId: input.ownerOrganizationId,
          checkoutId: input.checkoutId,
          supplierOrderId: input.supplierOrderId,
          shipmentId: input.shipmentId,
          kind: input.kind,
          format: input.format,
          source: "UPLOADED",
          status: input.requiredSignatureCount > 0 ? "AWAITING_SIGNATURE" : "GENERATED",
          title: input.title,
          documentNumber: input.documentNumber,
          storageKey: key,
          fileName: input.fileName,
          contentType,
          byteSize: body.byteLength,
          checksumSha256: checksum,
          requiredSignatureCount: input.requiredSignatureCount,
          immutableAt: new Date(),
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          externalId: input.externalId,
          metadata: input.metadata == null ? Prisma.JsonNull : input.metadata as Prisma.InputJsonValue,
        }, include: { signatures: true } });
        await tx.auditLog.create({ data: { ...context, action: "document.uploaded", entityType: "Document", entityId: document.id, after: { documentNumber: document.documentNumber, version: document.version, kind: document.kind, checksumSha256: checksum } } });
        await tx.outboxEvent.create({ data: { aggregateType: "Document", aggregateId: document.id, eventType: "DocumentUploaded", payload: { documentId: document.id, ownerOrganizationId: document.ownerOrganizationId, kind: document.kind } } });
        await tx.uploadAsset.update({ where: { id: asset.id }, data: { metadata: { documentId: document.id, documentKind: document.kind } } });
        return document;
      });
    } catch (error) {
      await this.uploads.release(asset.id, "Document upload transaction failed");
      throw error;
    }
  }

  async generateOrderDocumentPack(orderId: string, input: GenerateOrderDocumentPackRequest, context: SupplierActorContext) {
    const order = await this.prisma.supplierOrder.findUnique({
      where: { id: orderId },
      include: {
        supplier: true,
        buyer: true,
        items: { include: { offer: { include: { productVariant: { include: { product: true } } } } } },
        shipments: { where: { id: input.shipmentId }, include: { items: true, warehouse: true } },
      },
    });
    if (!order) throw new NotFoundException("Supplier order not found");
    if (order.supplierOrganizationId !== context.organizationId && !(await this.isOperator(context.organizationId))) {
      throw new ForbiddenException("Only the order supplier or operator can generate order documents");
    }
    if (order.paymentStatus !== "PAID") throw new ConflictException("Order documents require confirmed payment");
    const shipment = order.shipments[0];
    if (!shipment) throw new BadRequestException("Shipment does not belong to this supplier order");
    if (!["DISPATCHED", "IN_TRANSIT", "PARTIALLY_DELIVERED", "DELIVERED"].includes(shipment.status)) {
      throw new ConflictException("Shipment must be dispatched before generating the document pack");
    }
    const destinationAddress = formatDestinationAddress(shipment.destinationAddress);
    if (!destinationAddress) throw new ConflictException("Shipment destination address is required for the waybill");

    const templates = await this.prisma.documentTemplate.findMany({
      where: {
        code: { in: orderDocumentDefinitions.map(({ templateCode }) => templateCode) },
        status: "ACTIVE",
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
      },
      orderBy: { version: "desc" },
    });
    const templateByCode = new Map(templates.map((template) => [template.code, template]));
    const missingTemplates = orderDocumentDefinitions.filter(({ templateCode }) => !templateByCode.has(templateCode));
    if (missingTemplates.length) {
      throw new ConflictException(`Active document templates are missing: ${missingTemplates.map(({ templateCode }) => templateCode).join(", ")}`);
    }

    const orderItemById = new Map(order.items.map((item) => [item.id, item]));
    const orderItems = order.items.map((item, index) => {
      const quantity = item.acceptedQuantity.toString();
      return `${index + 1}. ${item.offer.productVariant.product.canonicalName} — ${quantity} × ${formatMinorUnits(item.unitPriceMinor)} = ${formatMinorUnits(item.totalPriceMinor)} ${item.currency}`;
    }).join("\n");
    const shipmentItems = shipment.items.map((item, index) => {
      const orderItem = orderItemById.get(item.supplierOrderItemId);
      return `${index + 1}. ${orderItem?.offer.productVariant.product.canonicalName ?? "Товар"} — ${item.quantity.toString()}`;
    }).join("\n");
    const total = formatMinorUnits(order.subtotalAmountMinor);

    const generated = [];
    for (const definition of orderDocumentDefinitions) {
      const template = templateByCode.get(definition.templateCode)!;
      const documentNumber = definition.number(order.orderNumber, shipment.shipmentNumber);
      const existing = await this.prisma.document.findFirst({
        where: {
          ownerOrganizationId: order.supplierOrganizationId,
          supplierOrderId: order.id,
          shipmentId: shipment.id,
          kind: definition.kind,
          documentNumber,
          status: { notIn: ["FAILED", "SUPERSEDED", "ARCHIVED"] },
        },
        orderBy: { version: "desc" },
      });
      if (existing) {
        generated.push(existing);
        continue;
      }

      const data = {
        order: { number: order.orderNumber, total, currency: order.currency, items: orderItems },
        invoice: { number: documentNumber, total, currency: order.currency },
        shipment: { number: shipment.shipmentNumber, items: shipmentItems, trackingNumber: shipment.trackingNumber },
        supplier: { name: order.supplier.legalName, bin: order.supplier.bin },
        buyer: { name: order.buyer.legalName, bin: order.buyer.bin },
        recipient: { name: shipment.recipientName, address: destinationAddress },
        warehouse: { name: shipment.warehouse.name, address: shipment.warehouse.addressLine },
      };
      try {
        generated.push(await this.generate({
          ownerOrganizationId: order.supplierOrganizationId,
          templateId: template.id,
          checkoutId: order.checkoutId,
          supplierOrderId: order.id,
          shipmentId: shipment.id,
          title: definition.title(order.orderNumber),
          documentNumber,
          data,
          metadata: { purpose: "ORDER_DOCUMENT_PACK", snapshotVersion: 1 },
        }, context));
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
        generated.push(await this.prisma.document.findFirstOrThrow({
          where: { ownerOrganizationId: order.supplierOrganizationId, documentNumber, version: 1 },
        }));
      }
    }

    return { supplierOrderId: order.id, shipmentId: shipment.id, documents: generated };
  }

  async createVersion(documentId: string, input: CreateDocumentVersionInput, context: SupplierActorContext) {
    const current = await this.get(documentId, context);
    if (current.source !== "GENERATED") throw new ConflictException("Only generated documents can be regenerated as a new version");
    const templateId = input.templateId ?? current.templateId;
    if (!templateId) throw new ConflictException("Document template is missing");
    const template = await this.prisma.documentTemplate.findUnique({ where: { id: templateId } });
    if (!template || template.status !== "ACTIVE") throw new NotFoundException("Active document template not found");
    const created = await this.prisma.document.create({ data: {
      ownerOrganizationId: current.ownerOrganizationId,
      templateId: template.id,
      checkoutId: current.checkoutId,
      supplierOrderId: current.supplierOrderId,
      shipmentId: current.shipmentId,
      previousVersionId: current.id,
      kind: template.kind,
      format: template.format,
      source: "GENERATED",
      status: "GENERATING",
      title: current.title,
      documentNumber: current.documentNumber,
      version: current.version + 1,
      dataSnapshot: input.data as Prisma.InputJsonValue,
      templateSnapshot: { id: template.id, code: template.code, version: template.version, body: template.templateBody, locale: template.locale, format: template.format },
      requiredSignatureCount: template.requiredSignatureCount,
      expiresAt: current.expiresAt,
      metadata: { versionReason: input.reason },
    } });
    const updated = await this.renderAndFinalize(created.id, template.templateBody, input.data, context);
    await this.prisma.document.update({ where: { id: current.id }, data: { status: "SUPERSEDED" } });
    return updated;
  }

  private async renderAndFinalize(documentId: string, templateBody: string, data: Record<string, unknown>, context: SupplierActorContext) {
    const document = await this.prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    try {
      const body = await this.renderer.render(document.format, document.title, templateBody, data);
      const checksum = createHash("sha256").update(body).digest("hex");
      const extension = document.format.toLowerCase();
      const key = `documents/${document.ownerOrganizationId}/${new Date().getUTCFullYear()}/${document.id}-v${document.version}.${extension}`;
      const contentType = document.format === "PDF" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      await this.storage.put(key, body, contentType);
      return this.prisma.$transaction(async (tx) => {
        const finalized = await tx.document.update({ where: { id: document.id }, data: {
          status: document.requiredSignatureCount > 0 ? "AWAITING_SIGNATURE" : "GENERATED",
          storageKey: key,
          fileName: `${document.documentNumber}-v${document.version}.${extension}`,
          contentType,
          byteSize: body.byteLength,
          checksumSha256: checksum,
          generatedAt: new Date(),
          immutableAt: new Date(),
          failureReason: null,
        }, include: { template: true, signatures: true } });
        await tx.auditLog.create({ data: { ...context, action: "document.generated", entityType: "Document", entityId: document.id, after: { documentNumber: document.documentNumber, version: document.version, checksumSha256: checksum, byteSize: body.byteLength } } });
        await tx.outboxEvent.create({ data: { aggregateType: "Document", aggregateId: document.id, eventType: "DocumentGenerated", payload: { documentId: document.id, ownerOrganizationId: document.ownerOrganizationId, kind: document.kind, status: finalized.status } } });
        return finalized;
      });
    } catch (error) {
      await this.prisma.document.update({ where: { id: document.id }, data: { status: "FAILED", failureReason: error instanceof Error ? error.message : "Document generation failed" } });
      throw error;
    }
  }

  async createSignatureSession(documentId: string, input: CreateSignatureSessionInput, context: SupplierActorContext) {
    const document = await this.get(documentId, context);
    const operator = await this.isOperator(context.organizationId);
    if (input.signerOrganizationId && input.signerOrganizationId !== context.organizationId && !operator) throw new ForbiddenException("Signer organization must be the active organization");
    if (input.signerUserId && input.signerUserId !== context.actorId && !operator) throw new ForbiddenException("Signer user must be the authenticated user");
    if (!document.checksumSha256 || !document.storageKey) throw new ConflictException("Document content is not ready for signature");
    if (!["GENERATED", "AWAITING_SIGNATURE", "PARTIALLY_SIGNED"].includes(document.status)) throw new ConflictException("Document cannot be signed in its current state");
    const adapter = this.signatures.resolve(input.method);
    const expiresAt = new Date(Date.now() + input.expiresInMinutes * 60_000);
    const result = await adapter.createSession({ documentId, checksumSha256: document.checksumSha256, method: input.method, signerName: input.signerName, expiresAt });
    const signatureHash = result.status === "SIGNED" ? createHash("sha256").update(`${document.checksumSha256}:${result.externalSessionId}`).digest("hex") : null;
    const signature = await this.prisma.documentSignature.create({ data: {
      documentId,
      signerOrganizationId: input.signerOrganizationId,
      signerUserId: input.signerUserId,
      signerName: input.signerName,
      method: input.method,
      status: result.status,
      externalSessionId: result.externalSessionId,
      signatureHash,
      signedAt: result.status === "SIGNED" ? new Date() : null,
      expiresAt,
      evidence: result.evidence as Prisma.InputJsonValue | undefined,
    } });
    const updatedDocument = result.status === "SIGNED" ? await this.refreshDocumentSignatureStatus(documentId) : await this.prisma.document.update({ where: { id: documentId }, data: { status: "AWAITING_SIGNATURE" } });
    await this.prisma.auditLog.create({ data: { ...context, action: "document.signature_session.created", entityType: "DocumentSignature", entityId: signature.id, after: { documentId, method: input.method, status: signature.status, signerOrganizationId: signature.signerOrganizationId } } });
    return { signature, signingUrl: result.signingUrl, document: updatedDocument };
  }

  async createLocalEdsSignatureSession(documentId: string, input: Omit<CreateSignatureSessionInput, "method"> & { method: "EDS" }, context: SupplierActorContext) {
    const document = await this.get(documentId, context);
    const operator = await this.isOperator(context.organizationId);
    if (input.signerOrganizationId && input.signerOrganizationId !== context.organizationId && !operator) throw new ForbiddenException("Signer organization must be the active organization");
    if (input.signerUserId && input.signerUserId !== context.actorId && !operator) throw new ForbiddenException("Signer user must be the authenticated user");
    if (!document.checksumSha256 || !document.storageKey) throw new ConflictException("Document content is not ready for signature");
    if (!["GENERATED", "AWAITING_SIGNATURE", "PARTIALLY_SIGNED"].includes(document.status)) throw new ConflictException("Document cannot be signed in its current state");
    const externalSessionId = `ncalayer-${randomUUID()}`;
    const expiresAt = new Date(Date.now() + input.expiresInMinutes * 60_000);
    const signature = await this.prisma.documentSignature.create({ data: {
      documentId,
      signerOrganizationId: input.signerOrganizationId,
      signerUserId: input.signerUserId,
      signerName: input.signerName,
      method: "EDS",
      status: "SESSION_CREATED",
      externalSessionId,
      expiresAt,
      evidence: { provider: "ncalayer-local", format: "CMS", checksumSha256: document.checksumSha256 },
    } });
    const updatedDocument = await this.prisma.document.update({ where: { id: documentId }, data: { status: "AWAITING_SIGNATURE" } });
    await this.prisma.auditLog.create({ data: { ...context, action: "document.signature_session.created", entityType: "DocumentSignature", entityId: signature.id, after: { documentId, method: "EDS", status: signature.status, provider: "ncalayer-local", signerOrganizationId: signature.signerOrganizationId } } });
    return { signature, signingUrl: null, document: updatedDocument };
  }

  async completeSignature(signatureId: string, input: CompleteDocumentSignatureInput, context: SupplierActorContext, trustedExternalCallback = false) {
    const signature = await this.prisma.documentSignature.findUnique({ where: { id: signatureId }, include: { document: { include: { supplierOrder: true } } } });
    if (!signature) throw new NotFoundException("Document signature not found");
    await this.get(signature.documentId, context);
    if (["EDS", "EGOV_QR", "EXTERNAL"].includes(signature.method) && !trustedExternalCallback) throw new ForbiddenException("External signature status is accepted only through a verified gateway callback");
    if (!["PENDING", "SESSION_CREATED"].includes(signature.status)) throw new ConflictException("Signature session is already final");
    if (signature.expiresAt && signature.expiresAt < new Date()) throw new ConflictException("Signature session has expired");
    const claimed = await this.prisma.documentSignature.updateMany({ where: { id: signatureId, status: { in: ["PENDING", "SESSION_CREATED"] } }, data: {
      status: input.status,
      externalSignatureId: input.externalSignatureId,
      signatureHash: input.status === "SIGNED" ? input.signatureHash ?? createHash("sha256").update(`${signature.document.checksumSha256}:${signature.externalSessionId}:${Date.now()}`).digest("hex") : null,
      signedAt: input.status === "SIGNED" ? new Date() : null,
      rejectionReason: input.status === "REJECTED" ? input.rejectionReason : null,
      evidence: input.evidence == null ? Prisma.JsonNull : input.evidence as Prisma.InputJsonValue,
    } });
    if (claimed.count !== 1) {
      const current = await this.prisma.documentSignature.findUniqueOrThrow({ where: { id: signatureId }, include: { document: { include: { supplierOrder: true } } } });
      if (current.status !== input.status || (input.externalSignatureId && current.externalSignatureId !== input.externalSignatureId)) throw new ConflictException("Signature session already has a conflicting terminal status");
      return { signature: current, document: current.document };
    }
    const updated = await this.prisma.documentSignature.findUniqueOrThrow({ where: { id: signatureId } });
    const document = input.status === "SIGNED" ? await this.refreshDocumentSignatureStatus(signature.documentId) : await this.prisma.document.update({ where: { id: signature.documentId }, data: { status: input.status === "REJECTED" ? "REJECTED" : "AWAITING_SIGNATURE" } });
    await this.prisma.$transaction([
      this.prisma.auditLog.create({ data: { ...context, action: "document.signature.completed", entityType: "DocumentSignature", entityId: signature.id, before: { status: signature.status }, after: { status: updated.status, documentStatus: document.status } } }),
      this.prisma.outboxEvent.create({ data: { aggregateType: "Document", aggregateId: signature.documentId, eventType: updated.status === "SIGNED" ? "DocumentSigned" : "DocumentSignatureChanged", payload: { documentId: signature.documentId, signatureId: signature.id, signatureStatus: updated.status, documentStatus: document.status, ownerOrganizationId: signature.document.ownerOrganizationId } } }),
    ]);
    return { signature: updated, document };
  }

  private async refreshDocumentSignatureStatus(documentId: string) {
    const document = await this.prisma.document.findUniqueOrThrow({ where: { id: documentId }, include: { signatures: true } });
    const signedCount = document.signatures.filter(({ status }) => status === "SIGNED").length;
    const required = Math.max(1, document.requiredSignatureCount);
    await this.prisma.document.updateMany({ where: { id: documentId, status: { not: "SIGNED" } }, data: { status: signedCount >= required ? "SIGNED" : "PARTIALLY_SIGNED", immutableAt: document.immutableAt ?? new Date() } });
    return this.prisma.document.findUniqueOrThrow({ where: { id: documentId } });
  }

  async archive(documentId: string, context: SupplierActorContext) {
    const document = await this.get(documentId, context);
    if (["GENERATING", "DRAFT"].includes(document.status)) throw new ConflictException("Unfinished document cannot be archived");
    const archived = await this.prisma.document.update({ where: { id: documentId }, data: { status: "ARCHIVED" } });
    await this.prisma.auditLog.create({ data: { ...context, action: "document.archived", entityType: "Document", entityId: document.id, before: { status: document.status }, after: { status: archived.status } } });
    return archived;
  }

  async download(documentId: string, context: SupplierActorContext) {
    const document = await this.get(documentId, context);
    if (!document.storageKey || !document.contentType || !document.fileName) throw new ConflictException("Document file is not ready");
    const signedUrl = await this.storage.signedDownloadUrl(document.storageKey);
    if (signedUrl) return { document, signedUrl, body: null };
    return { document, signedUrl: null, body: await this.storage.get(document.storageKey) };
  }

  capabilities() { return this.signatures.capabilities(); }

  private async assertReferences(ownerOrganizationId: string, checkoutId?: string | null, supplierOrderId?: string | null, shipmentId?: string | null) {
    const checkout = checkoutId ? await this.prisma.checkout.findUnique({ where: { id: checkoutId }, select: { buyerOrganizationId: true, supplierOrders: { select: { supplierOrganizationId: true, buyerOrganizationId: true } } } }) : null;
    if (checkoutId && !checkout) throw new BadRequestException("Checkout does not exist");
    const order = supplierOrderId ? await this.prisma.supplierOrder.findUnique({ where: { id: supplierOrderId }, select: { supplierOrganizationId: true, buyerOrganizationId: true, checkoutId: true } }) : null;
    if (supplierOrderId && !order) throw new BadRequestException("Supplier order does not exist");
    const shipment = shipmentId ? await this.prisma.shipment.findUnique({ where: { id: shipmentId }, select: { supplierOrderId: true, supplierOrder: { select: { supplierOrganizationId: true, buyerOrganizationId: true, checkoutId: true } } } }) : null;
    if (shipmentId && !shipment) throw new BadRequestException("Shipment does not exist");
    if (order && ![order.supplierOrganizationId, order.buyerOrganizationId].includes(ownerOrganizationId)) throw new BadRequestException("Document owner is not a party to the supplier order");
    if (shipment && ![shipment.supplierOrder.supplierOrganizationId, shipment.supplierOrder.buyerOrganizationId].includes(ownerOrganizationId)) throw new BadRequestException("Document owner is not a party to the shipment order");
    if (order && shipment && shipment.supplierOrderId !== supplierOrderId) throw new BadRequestException("Shipment belongs to another supplier order");
    const relatedOrder = order ?? shipment?.supplierOrder ?? null;
    if (relatedOrder && checkoutId && relatedOrder.checkoutId !== checkoutId) throw new BadRequestException("Document references belong to another checkout");
    if (checkout && ![checkout.buyerOrganizationId, ...checkout.supplierOrders.flatMap(({ supplierOrganizationId, buyerOrganizationId }) => [supplierOrganizationId, buyerOrganizationId])].includes(ownerOrganizationId)) throw new BadRequestException("Document owner is not a party to the checkout");
  }
}
