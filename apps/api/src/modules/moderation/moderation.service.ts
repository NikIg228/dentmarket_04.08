import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { ApproveImportProductCandidateInput, ApproveProductCandidateInput, CatalogImportReview, CatalogImportReviewQueueResponse, RejectProductCandidateInput, SubmitProductCandidateInput } from "@marketplace/schemas";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import type { SupplierActorContext } from "../suppliers/supplier-access.service";
import { normalizeCatalogText, rankVariants } from "../imports/matching";

const importReviewInclude = Prisma.validator<Prisma.ProductCandidateInclude>()({
  supplier: { include: { organization: true } },
  externalItem: {
    include: {
      importRow: { include: { batch: true } },
      matchCandidates: {
        include: { productVariant: { include: { product: true } } },
        orderBy: { score: "desc" },
      },
    },
  },
  approvedProduct: true,
  approvedVariant: {
    include: {
      supplierOffers: {
        include: {
          publication: true,
          prices: { where: { status: "ACTIVE" }, orderBy: { validFrom: "desc" }, take: 1 },
          inventoryBalances: { orderBy: { quantityAvailable: "desc" }, take: 1 },
          packaging: true,
        },
      },
    },
  },
});

type ImportReviewRecord = Prisma.ProductCandidateGetPayload<{ include: typeof importReviewInclude }>;

function record(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  private async isOperator(organizationId: string) {
    return Boolean(await this.prisma.organizationCapability.findUnique({ where: { organizationId_capability: { organizationId, capability: "MARKETPLACE_OPERATOR" } } }));
  }

  private async assertOperator(context: SupplierActorContext) {
    if (!(await this.isOperator(context.organizationId))) throw new ForbiddenException("Marketplace operator access is required");
  }

  private async importReviewPresentation(candidate: ImportReviewRecord, agreementActive?: boolean): Promise<CatalogImportReview> {
    const row = candidate.externalItem.importRow;
    if (!row) throw new BadRequestException("Product candidate is not linked to an import row");
    const offer = candidate.approvedVariant?.supplierOffers.find(({ supplierOrganizationId }) => supplierOrganizationId === candidate.supplierOrganizationId) ?? null;
    const price = offer?.prices[0] ?? null;
    const balance = offer?.inventoryBalances[0] ?? null;
    const now = new Date();
    const activeAgreement = offer ? agreementActive ?? Boolean(await this.prisma.marketplaceAgreement.findFirst({
      where: { supplierOrganizationId: candidate.supplierOrganizationId, status: { in: ["ACTIVE", "NON_RENEWING"] }, startsAt: { lte: now }, endsAt: { gt: now } },
      select: { id: true },
    })) : false;
    const blockers: string[] = [];
    if (candidate.approvedProduct?.status !== "ACTIVE") blockers.push("Карточка товара не активна");
    if (candidate.approvedVariant?.status !== "ACTIVE") blockers.push("Вариант товара не активен");
    if (!offer?.saleUnitId || !offer.packagingId) blockers.push("Не заданы единица продажи и упаковка");
    if (!price || price.currency !== "KZT" || price.amountMinor.lte(0) || Boolean(price.freshnessExpiresAt && price.freshnessExpiresAt < now)) blockers.push("Нет свежей положительной цены в KZT");
    if (!balance || balance.quantityAvailable.lte(0) || balance.freshnessStatus !== "FRESH" || Boolean(balance.freshnessExpiresAt && balance.freshnessExpiresAt < now)) blockers.push("Нет свежего доступного остатка");
    if (offer && !activeAgreement) blockers.push("Нет действующего договора поставщика с маркетплейсом");

    return {
      id: candidate.id,
      status: candidate.status,
      createdAt: candidate.createdAt.toISOString(),
      updatedAt: candidate.updatedAt.toISOString(),
      supplier: { organizationId: candidate.supplierOrganizationId, displayName: candidate.supplier.organization.displayName },
      proposed: { name: candidate.proposedName, sku: candidate.proposedSku, gtin: candidate.proposedGtin, brand: candidate.proposedBrand },
      source: {
        externalItemId: candidate.externalItemId,
        externalId: candidate.externalItem.externalId,
        fileName: row.batch.fileName,
        batchId: row.batchId,
        rowNumber: row.rowNumber,
        normalizedData: record(row.normalizedData),
        complianceStatus: candidate.externalItem.complianceStatus,
        complianceReasons: Array.isArray(candidate.externalItem.complianceReasons) ? candidate.externalItem.complianceReasons.map(String) : [],
      },
      suggestedMatches: candidate.externalItem.matchCandidates.map((match) => ({
        variantId: match.productVariantId,
        productId: match.productVariant.productId,
        productName: match.productVariant.product.canonicalName,
        sku: match.productVariant.sku,
        score: match.score.toString(),
        reasons: Array.isArray(match.reasons) ? match.reasons.map(String) : [],
      })),
      decision: candidate.decidedAt || candidate.rejectionReason ? { decidedAt: candidate.decidedAt?.toISOString() ?? null, rejectionReason: candidate.rejectionReason } : null,
      result: candidate.approvedProduct && candidate.approvedVariant && offer ? {
        product: { id: candidate.approvedProduct.id, name: candidate.approvedProduct.canonicalName, status: candidate.approvedProduct.status },
        variant: { id: candidate.approvedVariant.id, status: candidate.approvedVariant.status },
        offer: {
          id: offer.id,
          status: offer.status,
          version: offer.version,
          publicationStatus: offer.publication?.status ?? "DRAFT",
          marketplaceVisible: offer.publication?.marketplaceVisible ?? false,
          publishedAt: offer.publication?.publishedAt?.toISOString() ?? null,
          priceMinor: price?.amountMinor.toString() ?? null,
          currency: price?.currency ?? null,
          quantityAvailable: balance?.quantityAvailable.toString() ?? null,
          readinessBlockers: blockers,
        },
      } : null,
    };
  }

  async listImportReviews(context: SupplierActorContext): Promise<CatalogImportReviewQueueResponse> {
    await this.assertOperator(context);
    const now = new Date();
    const [candidates, industries, categories, units, agreements] = await Promise.all([
      this.prisma.productCandidate.findMany({
        where: { externalItem: { importRowId: { not: null } } },
        include: importReviewInclude,
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
        take: 100,
      }),
      this.prisma.industry.findMany({ where: { status: "ACTIVE" }, orderBy: { nameRu: "asc" }, select: { id: true, nameRu: true } }),
      this.prisma.category.findMany({ where: { status: "ACTIVE" }, orderBy: { nameRu: "asc" }, select: { id: true, nameRu: true, industryId: true } }),
      this.prisma.unitOfMeasure.findMany({ orderBy: { nameRu: "asc" }, select: { id: true, nameRu: true, symbol: true } }),
      this.prisma.marketplaceAgreement.findMany({ where: { status: { in: ["ACTIVE", "NON_RENEWING"] }, startsAt: { lte: now }, endsAt: { gt: now } }, select: { supplierOrganizationId: true } }),
    ]);
    const suppliersWithAgreement = new Set(agreements.map(({ supplierOrganizationId }) => supplierOrganizationId));
    return {
      items: await Promise.all(candidates.map((candidate) => this.importReviewPresentation(candidate, suppliersWithAgreement.has(candidate.supplierOrganizationId)))),
      options: {
        industries: industries.map(({ id, nameRu }) => ({ id, name: nameRu })),
        categories: categories.map(({ id, nameRu, industryId }) => ({ id, name: nameRu, industryId })),
        units: units.map(({ id, nameRu, symbol }) => ({ id, name: nameRu, symbol })),
      },
    };
  }

  async submit(input: SubmitProductCandidateInput, context: SupplierActorContext) {
    const supplier = await this.prisma.supplierProfile.findUnique({ where: { organizationId: context.organizationId } });
    if (!supplier) throw new NotFoundException("Supplier profile not found");
    if (input.suggestedCategoryId && !await this.prisma.category.findFirst({ where: { id: input.suggestedCategoryId, status: "ACTIVE" } })) throw new NotFoundException("Suggested category not found");
    const duplicateSuggestions = await this.prisma.product.findMany({
      where: { status: { in: ["ACTIVE", "UNDER_REVIEW"] }, OR: [
        ...(input.proposedGtin ? [{ gtin: input.proposedGtin }, { variants: { some: { gtin: input.proposedGtin } } }] : []),
        { canonicalName: { contains: input.proposedName, mode: "insensitive" } },
      ] },
      select: { id: true, canonicalName: true, gtin: true, status: true, variants: { select: { id: true, sku: true, gtin: true }, take: 10 } },
      take: 10,
    });
    return this.prisma.$transaction(async (tx) => {
      const existingSource = await tx.supplierDataSource.findFirst({ where: { supplierOrganizationId: context.organizationId, type: "MANUAL", name: "Supplier product proposals" } });
      const source = existingSource ?? await tx.supplierDataSource.create({ data: { supplierOrganizationId: context.organizationId, type: "MANUAL", name: "Supplier product proposals" } });
      const externalItem = await tx.supplierExternalItem.create({ data: { supplierOrganizationId: context.organizationId, sourceId: source.id, externalId: `proposal:${randomUUID()}`, supplierSku: input.proposedSku, name: input.proposedName, normalizedName: input.proposedName.toLocaleLowerCase("ru").replace(/[^\p{L}\p{N}]+/gu, " ").trim(), brandText: input.proposedBrand, gtin: input.proposedGtin, rawData: { ...input.rawSubmission, submitted: { proposedName: input.proposedName, proposedSku: input.proposedSku, proposedGtin: input.proposedGtin, proposedBrand: input.proposedBrand, suggestedCategoryId: input.suggestedCategoryId }, duplicateSuggestionIds: duplicateSuggestions.map(({ id }) => id) } } });
      const candidate = await tx.productCandidate.create({ data: { supplierOrganizationId: context.organizationId, externalItemId: externalItem.id, proposedName: input.proposedName, proposedSku: input.proposedSku, proposedGtin: input.proposedGtin, proposedBrand: input.proposedBrand, suggestedCategoryId: input.suggestedCategoryId } });
      await tx.auditLog.create({ data: { ...context, action: "moderation.product_candidate.submitted", entityType: "ProductCandidate", entityId: candidate.id, after: { proposedName: input.proposedName, duplicateSuggestionIds: duplicateSuggestions.map(({ id }) => id) } } });
      await tx.outboxEvent.create({ data: { aggregateType: "ProductCandidate", aggregateId: candidate.id, eventType: "ProductCandidateSubmitted", payload: { candidateId: candidate.id, supplierOrganizationId: context.organizationId, proposedName: input.proposedName } } });
      return { candidate, duplicateSuggestions };
    });
  }

  async list(status: "PENDING" | "APPROVED" | "REJECTED" | undefined, context: SupplierActorContext) {
    const operator = await this.isOperator(context.organizationId);
    return this.prisma.productCandidate.findMany({
      where: { status, supplierOrganizationId: operator ? undefined : context.organizationId },
      include: { supplier: { include: { organization: true } }, externalItem: true, suggestedCategory: true, approvedProduct: true, approvedVariant: true },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      take: 100,
    });
  }

  private async requireCandidate(candidateId: string, context: SupplierActorContext) {
    const candidate = await this.prisma.productCandidate.findUnique({ where: { id: candidateId }, include: { externalItem: true } });
    if (!candidate) throw new NotFoundException("Product candidate not found");
    if (candidate.supplierOrganizationId !== context.organizationId && !(await this.isOperator(context.organizationId))) throw new NotFoundException("Product candidate not found");
    return candidate;
  }

  async approve(candidateId: string, input: ApproveProductCandidateInput, context: SupplierActorContext) {
    const candidate = await this.requireCandidate(candidateId, context);
    if (candidate.status !== "PENDING") throw new ConflictException("Product candidate has already been decided");
    const existingVariants = await this.prisma.productVariant.findMany({ where: { status: { in: ["ACTIVE", "UNDER_REVIEW"] } }, include: { product: { include: { brand: true, manufacturer: true } } } });
    const duplicate = rankVariants({ name: input.canonicalName, normalizedName: normalizeCatalogText(input.canonicalName), supplierSku: candidate.proposedSku, gtin: candidate.proposedGtin, brandText: candidate.proposedBrand }, existingVariants)[0];
    if (duplicate && duplicate.score >= 0.8) throw new ConflictException(`Possible duplicate catalog card: ${duplicate.variant.product.canonicalName}. Link the supplier offer to the existing variant instead.`);
    const [industryCount, categoryCount] = await Promise.all([
      this.prisma.industry.count({ where: { id: { in: input.industryIds }, status: "ACTIVE" } }),
      this.prisma.category.count({ where: { id: { in: input.categoryIds }, status: "ACTIVE" } }),
    ]);
    if (industryCount !== new Set(input.industryIds).size || categoryCount !== new Set(input.categoryIds).size) throw new BadRequestException("Every industry and category must exist and be active");
    try {
      return await this.prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            canonicalName: input.canonicalName,
            slug: input.slug,
            productType: input.productType,
            regulatoryClass: input.regulatoryClass ?? null,
            gtin: candidate.proposedGtin,
            industries: { create: [...new Set(input.industryIds)].map((industryId) => ({ industryId })) },
            categories: { create: [...new Set(input.categoryIds)].map((categoryId) => ({ categoryId })) },
            searchDocument: { create: { searchableText: `${input.canonicalName} ${candidate.proposedSku ?? ""} ${candidate.proposedGtin ?? ""}`.trim(), normalizedText: input.canonicalName.toLocaleLowerCase("ru"), facets: { source: "supplier_candidate" } } },
          },
        });
        const variant = await tx.productVariant.create({ data: { productId: product.id, sku: candidate.proposedSku, gtin: candidate.proposedGtin, saleUnitId: input.saleUnitId ?? null, packageQuantity: input.packageQuantity } });
        const offer = await tx.supplierOffer.create({ data: { supplierOrganizationId: candidate.supplierOrganizationId, productVariantId: variant.id, saleUnitId: input.saleUnitId ?? null, sourceId: candidate.externalItem.sourceId, supplierSku: candidate.proposedSku, sourceType: "MANUAL", status: "DRAFT" } });
        const decided = await tx.productCandidate.update({ where: { id: candidateId }, data: { status: "APPROVED", approvedProductId: product.id, approvedVariantId: variant.id, decidedById: context.actorId, decidedAt: new Date() } });
        await tx.supplierExternalItem.update({ where: { id: candidate.externalItemId }, data: { matchedVariantId: variant.id } });
        await tx.supplierItemMatchCandidate.create({ data: { externalItemId: candidate.externalItemId, productVariantId: variant.id, score: 1, reasons: ["approved_product_candidate"], status: "CONFIRMED" } });
        if (candidate.externalItem.importRowId) await tx.importRow.update({ where: { id: candidate.externalItem.importRowId }, data: { status: "MATCHED" } });
        await tx.auditLog.create({ data: { ...context, action: "moderation.product_candidate.approved", entityType: "ProductCandidate", entityId: candidateId, before: candidate, after: { candidate: decided, product, variant, offer } } });
        await tx.outboxEvent.create({ data: { aggregateType: "ProductCandidate", aggregateId: candidateId, eventType: "ProductCandidateApproved", payload: { candidateId, supplierOrganizationId: candidate.supplierOrganizationId, productId: product.id, variantId: variant.id, offerId: offer.id } } });
        return { candidate: decided, product, variant, offer };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("Product slug, GTIN, SKU, or classification conflicts with existing catalog data");
      throw error;
    }
  }

  async approveImportCandidate(candidateId: string, input: ApproveImportProductCandidateInput, context: SupplierActorContext) {
    await this.assertOperator(context);
    const candidate = await this.prisma.productCandidate.findUnique({
      where: { id: candidateId },
      include: { externalItem: { include: { importRow: { include: { batch: true } } } } },
    });
    if (!candidate?.externalItem.importRow) throw new NotFoundException("Imported product candidate not found");
    if (candidate.status !== "PENDING") throw new ConflictException("Product candidate has already been decided");

    const normalized = record(candidate.externalItem.importRow.normalizedData);
    const priceMinor = stringValue(normalized?.priceMinor);
    const currency = stringValue(normalized?.currency);
    const quantityOnHand = stringValue(normalized?.quantityOnHand);
    if (!priceMinor || !/^[1-9]\d{0,19}$/.test(priceMinor) || currency !== "KZT") throw new BadRequestException("Imported offer requires a positive price in KZT");
    if (!quantityOnHand || !/^\d+(?:\.\d{1,6})?$/.test(quantityOnHand) || new Prisma.Decimal(quantityOnHand).lte(0)) throw new BadRequestException("Imported offer requires a positive available quantity");
    if (candidate.externalItem.complianceStatus !== "READY") throw new BadRequestException("Import row must pass line compliance before approval");

    const [industries, categories, unit, warehouse, existingVariants] = await Promise.all([
      this.prisma.industry.findMany({ where: { id: { in: input.industryIds }, status: "ACTIVE" }, select: { id: true } }),
      this.prisma.category.findMany({ where: { id: { in: input.categoryIds }, status: "ACTIVE" }, select: { id: true, industryId: true } }),
      this.prisma.unitOfMeasure.findUnique({ where: { id: input.saleUnitId } }),
      this.prisma.warehouse.findFirst({ where: { supplierOrganizationId: candidate.supplierOrganizationId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } }),
      this.prisma.productVariant.findMany({ where: { status: { in: ["ACTIVE", "UNDER_REVIEW"] } }, include: { product: { include: { brand: true, manufacturer: true } } } }),
    ]);
    if (industries.length !== new Set(input.industryIds).size || categories.length !== new Set(input.categoryIds).size) throw new BadRequestException("Every industry and category must exist and be active");
    const industryIds = new Set(input.industryIds);
    if (categories.some(({ industryId }) => !industryIds.has(industryId))) throw new BadRequestException("Every category must belong to a selected industry");
    if (!unit) throw new NotFoundException("Sale unit not found");
    if (!warehouse) throw new BadRequestException("Supplier needs an active warehouse before import approval");
    const duplicate = rankVariants({ name: input.canonicalName, normalizedName: normalizeCatalogText(input.canonicalName), supplierSku: candidate.proposedSku, gtin: candidate.proposedGtin, brandText: candidate.proposedBrand }, existingVariants)[0];
    if (duplicate && duplicate.score >= 0.8) throw new ConflictException(`Possible duplicate catalog card: ${duplicate.variant.product.canonicalName}. Link the supplier offer to the existing variant instead.`);

    try {
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.productCandidate.updateMany({ where: { id: candidateId, status: "PENDING" }, data: { status: "APPROVED", decidedById: context.actorId, decidedAt: new Date() } });
        if (claimed.count !== 1) throw new ConflictException("Product candidate has already been decided");
        const product = await tx.product.create({
          data: {
            canonicalName: input.canonicalName,
            slug: input.slug,
            productType: input.productType,
            regulatoryClass: input.regulatoryClass ?? null,
            gtin: candidate.proposedGtin,
            baseUnitId: input.saleUnitId,
            status: "ACTIVE",
            externalMetadata: { importedAsCanonicalDraft: true, source: "supplier_import_review", candidateId, batchId: candidate.externalItem.importRow!.batchId },
            industries: { create: [...industryIds].map((industryId) => ({ industryId })) },
            categories: { create: [...new Set(input.categoryIds)].map((categoryId) => ({ categoryId })) },
            searchDocument: { create: { searchableText: input.canonicalName, normalizedText: normalizeCatalogText(input.canonicalName), facets: { source: "supplier_import_review" } } },
          },
        });
        const variant = await tx.productVariant.create({
          data: { productId: product.id, sku: candidate.proposedSku, gtin: candidate.proposedGtin, saleUnitId: input.saleUnitId, packageQuantity: input.packageQuantity, status: "ACTIVE", externalMetadata: { source: "supplier_import_review", externalItemId: candidate.externalItemId } },
        });
        const packaging = await tx.productPackaging.create({
          data: { productVariantId: variant.id, unitId: input.saleUnitId, code: `sale-${candidate.id.slice(0, 8)}`, name: `${input.canonicalName} — ${unit.nameRu}`, level: "SALE", quantityInBaseUnit: input.packageQuantity },
        });
        const offer = await tx.supplierOffer.create({
          data: {
            supplierOrganizationId: candidate.supplierOrganizationId,
            productVariantId: variant.id,
            saleUnitId: input.saleUnitId,
            sourceId: candidate.externalItem.sourceId,
            packagingId: packaging.id,
            supplierSku: candidate.proposedSku,
            baseUnitsPerSaleUnit: input.packageQuantity,
            sourceType: "IMPORT",
            externalId: candidate.externalItem.externalId,
            status: "DRAFT",
            publication: { create: {} },
          },
        });
        const freshnessExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await tx.offerPrice.create({ data: { offerId: offer.id, amountMinor: priceMinor, currency, includesVat: true, source: "IMPORT", freshnessExpiresAt } });
        await tx.offerPriceHistory.create({ data: { offerId: offer.id, amountMinor: priceMinor, currency, includesVat: true, source: "IMPORT", changedById: context.actorId, reason: input.decisionReason } });
        await tx.inventoryBalance.create({
          data: {
            supplierOrganizationId: candidate.supplierOrganizationId,
            warehouseId: warehouse.id,
            productVariantId: variant.id,
            offerId: offer.id,
            quantityOnHand,
            quantityReserved: 0,
            safetyStock: 0,
            quantityAvailable: quantityOnHand,
            availabilityStatus: "IN_STOCK",
            freshnessStatus: "FRESH",
            source: "IMPORT",
            externalUpdatedAt: new Date(),
            lastSuccessfulSyncAt: new Date(),
            freshnessExpiresAt,
          },
        });
        await tx.supplierItemMatchCandidate.updateMany({ where: { externalItemId: candidate.externalItemId }, data: { status: "REJECTED" } });
        await tx.supplierItemMatchCandidate.upsert({
          where: { externalItemId_productVariantId: { externalItemId: candidate.externalItemId, productVariantId: variant.id } },
          update: { score: 1, reasons: ["operator_approved_import_candidate"], status: "CONFIRMED" },
          create: { externalItemId: candidate.externalItemId, productVariantId: variant.id, score: 1, reasons: ["operator_approved_import_candidate"], status: "CONFIRMED" },
        });
        await tx.supplierExternalItem.update({ where: { id: candidate.externalItemId }, data: { matchedVariantId: variant.id } });
        const key = candidate.proposedSku ? `SKU:${normalizeCatalogText(candidate.proposedSku)}` : candidate.proposedGtin ? `GTIN:${normalizeCatalogText(candidate.proposedGtin)}` : `NAME:${candidate.externalItem.normalizedName}`;
        const currentMemory = await tx.supplierMappingMemory.findFirst({ where: { supplierOrganizationId: candidate.supplierOrganizationId, externalKey: key, status: "ACTIVE" }, orderBy: { version: "desc" } });
        if (currentMemory) await tx.supplierMappingMemory.update({ where: { id: currentMemory.id }, data: { status: "REVOKED" } });
        await tx.supplierMappingMemory.create({ data: { supplierOrganizationId: candidate.supplierOrganizationId, sourceId: candidate.externalItem.sourceId, externalKey: key, externalId: candidate.externalItem.externalId, supplierSku: candidate.proposedSku, productVariantId: variant.id, version: (currentMemory?.version ?? 0) + 1, confidence: 1, reasons: ["operator_approved_import_candidate"], createdById: context.actorId, supersedesId: currentMemory?.id } });
        await tx.importRow.update({ where: { id: candidate.externalItem.importRow!.id }, data: { status: "MATCHED" } });
        await tx.productCandidate.update({ where: { id: candidateId }, data: { approvedProductId: product.id, approvedVariantId: variant.id } });
        await tx.auditLog.create({ data: { ...context, action: "moderation.import_candidate.approved", entityType: "ProductCandidate", entityId: candidateId, before: { status: candidate.status }, after: { productId: product.id, variantId: variant.id, offerId: offer.id, decisionReason: input.decisionReason } } });
        await tx.outboxEvent.create({ data: { aggregateType: "ProductCandidate", aggregateId: candidateId, eventType: "ImportedProductCandidateApproved", payload: { candidateId, supplierOrganizationId: candidate.supplierOrganizationId, productId: product.id, variantId: variant.id, offerId: offer.id } } });
      }, { maxWait: 15_000, timeout: 45_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("Product slug, GTIN, SKU, or mapping conflicts with existing catalog data");
      throw error;
    }
    const approved = await this.prisma.productCandidate.findUniqueOrThrow({ where: { id: candidateId }, include: importReviewInclude });
    return this.importReviewPresentation(approved);
  }

  async reject(candidateId: string, input: RejectProductCandidateInput, context: SupplierActorContext) {
    const candidate = await this.requireCandidate(candidateId, context);
    if (candidate.status !== "PENDING") throw new ConflictException("Product candidate has already been decided");
    return this.prisma.$transaction(async (tx) => {
      const rejected = await tx.productCandidate.update({ where: { id: candidateId }, data: { status: "REJECTED", rejectionReason: input.reason, decidedById: context.actorId, decidedAt: new Date() } });
      await tx.auditLog.create({ data: { ...context, action: "moderation.product_candidate.rejected", entityType: "ProductCandidate", entityId: candidateId, before: candidate, after: rejected } });
      await tx.outboxEvent.create({ data: { aggregateType: "ProductCandidate", aggregateId: candidateId, eventType: "ProductCandidateRejected", payload: { candidateId, supplierOrganizationId: candidate.supplierOrganizationId, reason: input.reason } } });
      return rejected;
    });
  }
}
