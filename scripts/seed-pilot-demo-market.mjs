import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "../apps/api/node_modules/@prisma/client/index.js";

const root = path.resolve(process.cwd());
const catalog = JSON.parse(
  await fs.readFile(
    path.join(root, "apps/buyer-web/app/data/public-catalog-fallback.json"),
    "utf8",
  ),
);
const prisma = new PrismaClient();
const normalize = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
const uuid = (key) => {
  const hex = crypto
    .createHash("sha256")
    .update(key)
    .digest("hex")
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
};
const canonicalKey = (product) =>
  [product.brand || "Без бренда", product.name]
    .map(normalize)
    .join("|")
    .toLocaleLowerCase("ru");
const slugFor = (product) =>
  `canonical-${crypto.createHash("sha256").update(canonicalKey(product)).digest("hex").slice(0, 32)}`;
const demoProducts = catalog.products.filter((product) =>
  product.offers?.some((offer) => offer.demo === true),
);

if (catalog.catalogMode !== "PILOT" || catalog.total !== 500) {
  throw new Error("Expected the active 500-card PILOT catalog");
}
if (demoProducts.length !== 50) {
  throw new Error(
    `Expected 50 demo-priced products, received ${demoProducts.length}`,
  );
}

try {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  await prisma.$queryRaw`SELECT 1`;
  const city = await prisma.city.findFirst({ orderBy: { nameRu: "asc" } });
  const saleUnit = await prisma.unitOfMeasure.findFirst({
    where: { OR: [{ code: "piece" }, { symbol: "шт" }, { symbol: "шт." }] },
  });
  if (!city || !saleUnit) {
    throw new Error(
      "Reference city or piece unit is missing; run the main seed first",
    );
  }
  const operatorCapability = await prisma.organizationCapability.findFirst({
    where: { capability: "MARKETPLACE_OPERATOR" },
    include: { organization: true },
  });
  const agreementTemplate = await prisma.documentTemplate.findUnique({
    where: {
      code_version: { code: "MARKETPLACE_SUPPLIER_AGREEMENT_RU", version: 1 },
    },
  });
  if (!operatorCapability || !agreementTemplate) {
    throw new Error(
      "Operator organization or marketplace agreement template is missing",
    );
  }

  const buyers = [];
  for (let index = 1; index <= 10; index += 1) {
    const number = String(index).padStart(2, "0");
    const organization = await prisma.organization.upsert({
      where: { bin: `9700000000${number}` },
      update: {
        legalName: `ТОО Демо-клиника ${number}`,
        displayName: `Демо-клиника ${number}`,
        status: "ACTIVE",
      },
      create: {
        id: uuid(`pilot-buyer-${number}`),
        bin: `9700000000${number}`,
        legalName: `ТОО Демо-клиника ${number}`,
        displayName: `Демо-клиника ${number}`,
      },
    });
    await prisma.organizationCapability.upsert({
      where: {
        organizationId_capability: {
          organizationId: organization.id,
          capability: "BUYER",
        },
      },
      update: {},
      create: { organizationId: organization.id, capability: "BUYER" },
    });
    buyers.push(organization);
  }

  const suppliers = [];
  for (let index = 1; index <= 10; index += 1) {
    const number = String(index).padStart(2, "0");
    const organization = await prisma.organization.upsert({
      where: { bin: `9800000000${number}` },
      update: {
        legalName: `ТОО Демо-поставщик ${number}`,
        displayName: `Демо-поставщик ${number}`,
        status: "ACTIVE",
      },
      create: {
        id: uuid(`pilot-supplier-${number}`),
        bin: `9800000000${number}`,
        legalName: `ТОО Демо-поставщик ${number}`,
        displayName: `Демо-поставщик ${number}`,
      },
    });
    await prisma.organizationCapability.upsert({
      where: {
        organizationId_capability: {
          organizationId: organization.id,
          capability: "SUPPLIER",
        },
      },
      update: {},
      create: { organizationId: organization.id, capability: "SUPPLIER" },
    });
    await prisma.supplierProfile.upsert({
      where: { organizationId: organization.id },
      update: {
        status: "ACTIVE",
        regulatoryDetails: {
          demo: true,
          officialDistributor: index <= 3,
          supplierWarranty: true,
        },
      },
      create: {
        organizationId: organization.id,
        regulatoryDetails: {
          demo: true,
          officialDistributor: index <= 3,
          supplierWarranty: true,
        },
      },
    });
    const warehouse = await prisma.warehouse.upsert({
      where: {
        supplierOrganizationId_code: {
          supplierOrganizationId: organization.id,
          code: "DEMO-01",
        },
      },
      update: {
        name: `Демо-склад ${number}`,
        cityId: city.id,
        status: "ACTIVE",
      },
      create: {
        id: uuid(`pilot-warehouse-${number}`),
        supplierOrganizationId: organization.id,
        code: "DEMO-01",
        name: `Демо-склад ${number}`,
        cityId: city.id,
        addressLine: `Учебный адрес, ${number}`,
      },
    });
    const agreementNumber = `PILOT-DEMO-${number}`;
    const agreementStart = new Date("2026-01-01T00:00:00.000Z");
    const agreementEnd = new Date("2028-01-01T00:00:00.000Z");
    const document = await prisma.document.upsert({
      where: {
        ownerOrganizationId_documentNumber_version: {
          ownerOrganizationId: organization.id,
          documentNumber: agreementNumber,
          version: 1,
        },
      },
      update: { status: "SIGNED", expiresAt: agreementEnd },
      create: {
        id: uuid(`pilot-agreement-document-${number}`),
        ownerOrganizationId: organization.id,
        templateId: agreementTemplate.id,
        kind: "MARKETPLACE_SUPPLIER_AGREEMENT",
        format: "PDF",
        source: "GENERATED",
        status: "SIGNED",
        title: `Демо-договор поставщика ${number}`,
        documentNumber: agreementNumber,
        version: 1,
        requiredSignatureCount: 0,
        generatedAt: agreementStart,
        immutableAt: agreementStart,
        expiresAt: agreementEnd,
        metadata: { demo: true, notLegallyBinding: true },
      },
    });
    await prisma.marketplaceAgreement.upsert({
      where: { agreementNumber },
      update: {
        status: "ACTIVE",
        startsAt: agreementStart,
        endsAt: agreementEnd,
        metadata: { demo: true, notLegallyBinding: true },
      },
      create: {
        id: uuid(`pilot-marketplace-agreement-${number}`),
        agreementNumber,
        supplierOrganizationId: organization.id,
        operatorOrganizationId: operatorCapability.organization.id,
        documentId: document.id,
        templateId: agreementTemplate.id,
        templateVersion: agreementTemplate.version,
        status: "ACTIVE",
        startsAt: agreementStart,
        endsAt: agreementEnd,
        activatedAt: agreementStart,
        metadata: { demo: true, notLegallyBinding: true },
      },
    });
    suppliers.push({ organization, warehouse });
  }

  let offersCreated = 0;
  for (const productInput of demoProducts) {
    const product = await prisma.product.findUnique({
      where: { slug: slugFor(productInput) },
      include: { variants: { orderBy: { createdAt: "asc" }, take: 1 } },
    });
    if (!product?.variants[0]) {
      throw new Error(
        `Synced product or variant is missing for ${productInput.id}`,
      );
    }
    const variant = product.variants[0];
    await prisma.product.update({
      where: { id: product.id },
      data: { status: "ACTIVE" },
    });
    await prisma.productVariant.update({
      where: { id: variant.id },
      data: { status: "ACTIVE" },
    });
    const supplierIds = [];
    const warehouseIds = [];
    const prices = [];
    for (const [supplierIndex, supplier] of suppliers.entries()) {
      const sourceOffer = productInput.offers[supplierIndex];
      const offerId = uuid(
        `pilot-offer-${productInput.id}-${supplierIndex + 1}`,
      );
      const offer = await prisma.supplierOffer.upsert({
        where: {
          supplierOrganizationId_productVariantId_saleUnitId: {
            supplierOrganizationId: supplier.organization.id,
            productVariantId: variant.id,
            saleUnitId: saleUnit.id,
          },
        },
        update: {
          supplierSku: sourceOffer.supplierSku,
          confirmationMode: sourceOffer.confirmationMode,
          sourceType: "MANUAL",
          externalId: `pilot-demo:${productInput.id}:${supplierIndex + 1}`,
          status: "ACTIVE",
        },
        create: {
          id: offerId,
          supplierOrganizationId: supplier.organization.id,
          productVariantId: variant.id,
          saleUnitId: saleUnit.id,
          supplierSku: sourceOffer.supplierSku,
          confirmationMode: sourceOffer.confirmationMode,
          sourceType: "MANUAL",
          externalId: `pilot-demo:${productInput.id}:${supplierIndex + 1}`,
          status: "ACTIVE",
        },
      });
      await prisma.offerPublication.upsert({
        where: { offerId: offer.id },
        update: {
          status: "PUBLISHED",
          marketplaceVisible: true,
          publishedAt: new Date(),
        },
        create: {
          offerId: offer.id,
          status: "PUBLISHED",
          marketplaceVisible: true,
          publishedAt: new Date(),
        },
      });
      await prisma.complianceCheck.upsert({
        where: {
          id: uuid(
            `pilot-compliance-${productInput.id}-${supplierIndex + 1}`,
          ),
        },
        update: {
          sellerOrganizationId: supplier.organization.id,
          offerId: offer.id,
          status: "PASSED",
          decision: "ALLOWED",
          riskLevel: "GREEN",
          evaluatedAt: new Date(),
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60_000),
          inputSnapshot: {
            source: "pilot_seed",
            offerId: offer.id,
            supplierOrganizationId: supplier.organization.id,
          },
          ruleSnapshot: [],
          reasons: ["pilot_supplier_documents_verified"],
          missingCredentials: [],
        },
        create: {
          id: uuid(
            `pilot-compliance-${productInput.id}-${supplierIndex + 1}`,
          ),
          sellerOrganizationId: supplier.organization.id,
          offerId: offer.id,
          status: "PASSED",
          decision: "ALLOWED",
          riskLevel: "GREEN",
          evaluatedAt: new Date(),
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60_000),
          inputSnapshot: {
            source: "pilot_seed",
            offerId: offer.id,
            supplierOrganizationId: supplier.organization.id,
          },
          ruleSnapshot: [],
          reasons: ["pilot_supplier_documents_verified"],
          missingCredentials: [],
        },
      });
      await prisma.offerPrice.upsert({
        where: {
          id: uuid(`pilot-price-${productInput.id}-${supplierIndex + 1}`),
        },
        update: {
          offerId: offer.id,
          amountMinor: sourceOffer.priceMinor,
          currency: "KZT",
          source: "MANUAL",
          status: "ACTIVE",
          freshnessExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
        },
        create: {
          id: uuid(`pilot-price-${productInput.id}-${supplierIndex + 1}`),
          offerId: offer.id,
          amountMinor: sourceOffer.priceMinor,
          currency: "KZT",
          source: "MANUAL",
          status: "ACTIVE",
          freshnessExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
        },
      });
      const quantity = sourceOffer.available ? 25 + supplierIndex * 7 : 0;
      await prisma.inventoryBalance.upsert({
        where: {
          supplierOrganizationId_warehouseId_productVariantId: {
            supplierOrganizationId: supplier.organization.id,
            warehouseId: supplier.warehouse.id,
            productVariantId: variant.id,
          },
        },
        update: {
          offerId: offer.id,
          quantityOnHand: quantity,
          quantityAvailable: quantity,
          availabilityStatus: quantity > 0 ? "IN_STOCK" : "OUT_OF_STOCK",
          freshnessStatus: "FRESH",
          lastSuccessfulSyncAt: new Date(),
          freshnessExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
        },
        create: {
          id: uuid(`pilot-balance-${productInput.id}-${supplierIndex + 1}`),
          supplierOrganizationId: supplier.organization.id,
          warehouseId: supplier.warehouse.id,
          productVariantId: variant.id,
          offerId: offer.id,
          quantityOnHand: quantity,
          quantityAvailable: quantity,
          availabilityStatus: quantity > 0 ? "IN_STOCK" : "OUT_OF_STOCK",
          freshnessStatus: "FRESH",
          lastSuccessfulSyncAt: new Date(),
          freshnessExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
        },
      });
      for (const method of ["CARRIER", "PICKUP"]) {
        await prisma.offerDeliveryOption.upsert({
          where: {
            offerId_warehouseId_method: {
              offerId: offer.id,
              warehouseId: supplier.warehouse.id,
              method,
            },
          },
          update: {
            priceType: method === "PICKUP" ? "FREE" : "FIXED",
            fixedAmountMinor: method === "CARRIER" ? 250000 : null,
            minLeadTimeHours: method === "PICKUP" ? 2 : 24,
            maxLeadTimeHours: method === "PICKUP" ? 8 : 72,
          },
          create: {
            id: uuid(
              `pilot-delivery-${productInput.id}-${supplierIndex + 1}-${method}`,
            ),
            offerId: offer.id,
            warehouseId: supplier.warehouse.id,
            method,
            priceType: method === "PICKUP" ? "FREE" : "FIXED",
            fixedAmountMinor: method === "CARRIER" ? 250000 : null,
            minLeadTimeHours: method === "PICKUP" ? 2 : 24,
            maxLeadTimeHours: method === "PICKUP" ? 8 : 72,
          },
        });
      }
      supplierIds.push(supplier.organization.id);
      warehouseIds.push(supplier.warehouse.id);
      prices.push(Number(sourceOffer.priceMinor));
      offersCreated += 1;
    }
    await prisma.productSearchDocument.update({
      where: { productId: product.id },
      data: {
        minPriceMinor: String(Math.min(...prices)),
        maxPriceMinor: String(Math.max(...prices)),
        minNormalizedPriceMinor: String(Math.min(...prices)),
        maxNormalizedPriceMinor: String(Math.max(...prices)),
        isAvailable: true,
        supplierIds,
        warehouseIds,
        cityIds: [city.id],
        deliveryMethods: ["CARRIER", "PICKUP"],
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        catalogCards: catalog.total,
        demoBuyers: buyers.length,
        demoSuppliers: suppliers.length,
        productsWithOffers: demoProducts.length,
        offersCreated,
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
