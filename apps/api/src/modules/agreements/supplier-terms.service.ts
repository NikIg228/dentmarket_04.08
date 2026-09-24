import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type SupplierTermsAcceptance as AcceptanceRecord } from "@prisma/client";
import { supplierLegalDocumentSchema, type AcceptSupplierTermsInput, type ReviewSupplierAdmissionInput, type SupplierTermsAcceptance, type SupplierTermsState } from "@marketplace/schemas";
import { PrismaService } from "../../platform/prisma/prisma.service";
import { PlatformAuthorityPolicy, type AuthorityActorContext } from "../access-control/platform-authority.policy";
import { SupplierLegalDocuments } from "./supplier-legal-documents";
import { assertOrganizationProfileComplete, supplierOrganizationPrerequisites } from "../organizations/organization-profile.service";

@Injectable()
export class SupplierTermsService {
  constructor(private readonly prisma: PrismaService, private readonly legal: SupplierLegalDocuments, private readonly authority: PlatformAuthorityPolicy) {}
  documentsAvailable() { return this.legal.current().available; }

  private async supplier(context: AuthorityActorContext, permission: "document.view" | "document.sign", db: Prisma.TransactionClient = this.prisma) {
    const membership = await db.organizationMembership.findFirst({
      where: { organizationId: context.organizationId, userId: context.actorId, status: "ACTIVE",
        organization: { status: "ACTIVE", capabilities: { some: { capability: "SUPPLIER" } } },
        user: { status: "ACTIVE" },
        roles: { some: { role: { organizationId: context.organizationId, permissions: { some: { permission: { code: permission } } } } } },
      }, include: { organization: true, user: true },
    });
    if (!membership) throw new ForbiddenException("Нет полномочий действовать от имени поставщика");
    return membership;
  }

  private present(value: AcceptanceRecord): SupplierTermsAcceptance {
    const organization = value.organizationSnapshot as { legalName: string; bin: string };
    return { id: value.id, organizationId: value.organizationId, userId: value.userId,
      legalName: organization.legalName, bin: organization.bin,
      representativeName: value.representativeName, representativeAuthority: value.representativeAuthority,
      bundleHash: value.bundleHash, acceptedAt: value.acceptedAt.toISOString(),
      documents: supplierLegalDocumentSchema.array().parse(value.documentsSnapshot),
      admissionStatus: value.admissionStatus, reviewReason: value.reviewReason,
      reviewedAt: value.reviewedAt?.toISOString() ?? null, reviewedById: value.reviewedById, version: value.version };
  }

  // An accepted bundle never grants sales by itself. Existing executed agreements
  // survive the additive migration, but cannot override a later manual decision.
  async commercialState(organizationId: string) {
    const bundle = this.legal.current();
    const acceptance = await this.prisma.supplierTermsAcceptance.findFirst({ where: { organizationId }, orderBy: { acceptedAt: "desc" }, include: { organization: true } });
    if (acceptance) {
      const contractAccepted = bundle.available && acceptance.bundleHash === bundle.hash && acceptance.organizationVersion === acceptance.organization.version;
      const admitted = contractAccepted && acceptance.admissionStatus === "APPROVED" && acceptance.organization.status === "ACTIVE" && acceptance.organization.version === acceptance.organizationVersion;
      return { acceptance: this.present(acceptance), contractAccepted, admitted, legacyAgreementActive: false };
    }
    const now = new Date();
    const legacy = await this.prisma.marketplaceAgreement.findFirst({ where: { supplierOrganizationId: organizationId, status: { in: ["ACTIVE", "NON_RENEWING"] }, startsAt: { lte: now }, endsAt: { gt: now } } });
    return { acceptance: null, contractAccepted: Boolean(legacy), admitted: Boolean(legacy), legacyAgreementActive: Boolean(legacy) };
  }

  async current(context: AuthorityActorContext): Promise<SupplierTermsState> {
    const { organization, user } = await this.supplier(context, "document.view");
    return { organization: { id: organization.id, legalName: organization.legalName, bin: organization.bin, version: organization.version, representativeName: user.displayName }, bundle: this.legal.current(), ...await this.commercialState(context.organizationId) };
  }

  async accept(input: AcceptSupplierTermsInput, context: AuthorityActorContext, evidence: { ipAddress: string | null; userAgent: string | null }) {
    const membership = await this.supplier(context, "document.sign");
    if (membership.organization.version !== input.organizationVersion) throw new ConflictException("Реквизиты организации изменились. Обновите страницу");
    const bundle = this.legal.current();
    if (!bundle.available) throw new ConflictException("Юридические документы ещё не опубликованы");
    if (input.bundleHash !== bundle.hash) throw new ConflictException("Редакция документов изменилась. Ознакомьтесь с ней заново");
    const reviewed = new Map(input.reviewedDocuments.map((document) => [document.code, document.hash]));
    if (!input.acknowledged || !input.actsForOrganization || reviewed.size !== bundle.documents.length || bundle.documents.some((document) => reviewed.get(document.code) !== document.hash)) throw new ConflictException("Необходимо просмотреть все документы текущей редакции");
    const key = { organizationId_bundleHash_organizationVersion: { organizationId: context.organizationId, bundleHash: bundle.hash, organizationVersion: input.organizationVersion } };
    const replay = await this.prisma.supplierTermsAcceptance.findUnique({ where: key });
    if (replay) return this.present(replay);
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const { organization, user } = await this.supplier(context, "document.sign", tx);
        if (organization.version !== input.organizationVersion) throw new ConflictException("Реквизиты организации изменились. Обновите страницу");
        await assertOrganizationProfileComplete(tx, organization.id);
        const acceptedAt = new Date();
        const acceptance = await tx.supplierTermsAcceptance.create({ data: {
          organizationId: organization.id, userId: user.id, bundleHash: bundle.hash,
          documentsSnapshot: bundle.documents as Prisma.InputJsonValue,
          organizationSnapshot: { legalName: organization.legalName, bin: organization.bin, displayName: organization.displayName }, organizationVersion: organization.version,
          representativeName: user.displayName, representativeAuthority: input.representativeAuthority,
          acceptedAt, evidenceSnapshot: { method: "AUTHENTICATED_ORGANIZATION_ACCEPTANCE", action: "Ознакомлен", actsForOrganization: true,
            reviewedDocuments: input.reviewedDocuments, ipAddress: evidence.ipAddress, userAgent: evidence.userAgent?.slice(0, 1000) ?? null },
        } });
        await tx.auditLog.create({ data: { ...context, action: "supplier_terms.accepted", entityType: "SupplierTermsAcceptance", entityId: acceptance.id, after: { bundleHash: bundle.hash, acceptedAt: acceptedAt.toISOString(), admissionStatus: "PENDING" } } });
        await tx.outboxEvent.create({ data: { aggregateType: "SupplierTermsAcceptance", aggregateId: acceptance.id, eventType: "SupplierTermsAccepted", payload: { supplierOrganizationId: organization.id, acceptanceId: acceptance.id } } });
        return acceptance;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return this.present(result);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await this.prisma.supplierTermsAcceptance.findUnique({ where: key });
        if (existing) return this.present(existing);
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") throw new ConflictException("Данные организации изменились. Обновите страницу");
      throw error;
    }
  }

  async list(context: AuthorityActorContext) {
    await this.authority.assertPlatformOperator(context);
    const records = await this.prisma.supplierTermsAcceptance.findMany({ orderBy: { acceptedAt: "desc" }, take: 200 });
    return { items: records.map((record) => this.present(record)) };
  }

  async review(id: string, input: ReviewSupplierAdmissionInput, context: AuthorityActorContext) {
    await this.authority.assertPlatformOperator(context);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const record = await tx.supplierTermsAcceptance.findUnique({ where: { id }, include: { organization: true } });
        if (!record) throw new NotFoundException("Принятие договора не найдено");
        if (record.organizationId === context.organizationId || record.userId === context.actorId) throw new ForbiddenException("Нельзя подтвердить собственное принятие договора");
        if (input.status === "APPROVED") {
          const bundle = this.legal.current();
          if (!input.organizationVerified || !input.representativeVerified || !bundle.available || record.bundleHash !== bundle.hash || record.organization.status !== "ACTIVE" || record.organizationVersion !== record.organization.version) throw new ConflictException("Проверьте организацию, полномочия и актуальную редакцию документов");
          const prerequisites = await supplierOrganizationPrerequisites(tx, record.organizationId);
          if (!prerequisites.profileComplete || !prerequisites.warehouseComplete || !prerequisites.credentialsComplete) throw new ConflictException("Для допуска необходимы заполненная анкета, склад с адресом и проверенные действующие документы организации");
        }
        const reviewedAt = new Date();
        const changed = await tx.supplierTermsAcceptance.updateMany({ where: { id, version: input.expectedVersion }, data: { admissionStatus: input.status, reviewedById: context.actorId, reviewedAt, reviewReason: input.reason, version: { increment: 1 } } });
        if (changed.count !== 1) throw new ConflictException("Решение уже изменено. Обновите список");
        await tx.auditLog.create({ data: { ...context, action: "supplier_admission.reviewed", entityType: "SupplierTermsAcceptance", entityId: id,
          before: { admissionStatus: record.admissionStatus }, after: { ...input, supplierOrganizationId: record.organizationId, reviewedAt: reviewedAt.toISOString() } } });
        await tx.outboxEvent.create({ data: { aggregateType: "SupplierTermsAcceptance", aggregateId: id, eventType: "SupplierAdmissionReviewed", payload: { supplierOrganizationId: record.organizationId, acceptanceId: id, status: input.status } } });
        return this.present(await tx.supplierTermsAcceptance.findUniqueOrThrow({ where: { id } }));
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") throw new ConflictException("Данные изменились. Обновите список");
      throw error;
    }
  }

  async download(id: string, context: AuthorityActorContext) {
    // Resolve authority before reading an acceptance belonging to another tenant.
    let own = true;
    try { await this.supplier(context, "document.view"); }
    catch (error) { if (!(error instanceof ForbiddenException)) throw error; await this.authority.assertPlatformOperator(context); own = false; }
    const record = await this.prisma.supplierTermsAcceptance.findFirst({ where: { id, ...(own ? { organizationId: context.organizationId } : {}) } });
    if (!record) throw new NotFoundException("Принятие договора не найдено");
    const value = this.present(record);
    return [`Принятые условия · ${value.acceptedAt}`, `${value.legalName} · БИН ${value.bin}`, `${value.representativeName} · ${value.representativeAuthority}`,
      ...value.documents.map((document) => `${document.title}\nРедакция: ${document.version}\nSHA-256: ${document.hash}\n\n${document.content}`)].join("\n\n────────\n\n");
  }

  async activeSupplierIds() {
    const now = new Date();
    const [records, legacy] = await Promise.all([
      this.prisma.supplierTermsAcceptance.findMany({ orderBy: { acceptedAt: "desc" }, include: { organization: { select: { status: true, version: true } } } }),
      this.prisma.marketplaceAgreement.findMany({ where: { status: { in: ["ACTIVE", "NON_RENEWING"] }, startsAt: { lte: now }, endsAt: { gt: now } }, select: { supplierOrganizationId: true } }),
    ]);
    const seen = new Set<string>(); const allowed = new Set<string>(); const bundle = this.legal.current();
    for (const record of records) {
      if (seen.has(record.organizationId)) continue;
      seen.add(record.organizationId);
      if (bundle.available && record.bundleHash === bundle.hash && record.admissionStatus === "APPROVED" && record.organization.status === "ACTIVE" && record.organization.version === record.organizationVersion) allowed.add(record.organizationId);
    }
    for (const record of legacy) if (!seen.has(record.supplierOrganizationId)) allowed.add(record.supplierOrganizationId);
    return [...allowed];
  }
}
