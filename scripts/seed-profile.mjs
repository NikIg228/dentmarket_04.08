import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const profile = process.argv[2];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const prisma = new PrismaClient();

const profiles = new Set(["reference", "operator", "test", "pilot"]);
const permissionCodes = [
  "catalog.product.view",
  "catalog.product.create",
  "catalog.product.moderate",
  "catalog.category.manage",
  "catalog.attribute.manage",
  "catalog.offer.edit",
  "inventory.view",
  "inventory.adjust",
  "order.create",
  "order.approve",
  "order.confirm",
  "payment.view",
  "payment.mock.capture",
  "payment.capture",
  "payment.merchant.manage",
  "payment.merchant.review",
  "payment.payout.manage",
  "payment.reconcile",
  "refund.request",
  "refund.approve",
  "document.sign",
  "document.upload",
  "document.issue",
  "document.accounting.review",
  "document.archive",
  "organization.members.manage",
  "organization.roles.manage",
  "organization.view",
  "operations.outbox.view",
  "operations.outbox.replay",
  "organization.create",
  "approval.manage",
  "audit.view",
  "supplier.profile.manage",
  "supplier.warehouse.manage",
  "import.manage",
  "matching.manage",
  "catalog.offer.publish",
  "pricing.manage",
  "inventory.reserve",
  "catalog.candidate.moderate",
  "pricing.contract.manage",
  "inventory.recall.manage",
  "inventory.freshness.manage",
  "integration.view",
  "integration.manage",
  "integration.reconcile",
  "delivery.view",
  "delivery.manage",
  "shipment.manage",
  "document.view",
  "document.manage",
  "document.template.manage",
  "compliance.view",
  "compliance.evaluate",
  "compliance.credential.manage",
  "compliance.review",
  "compliance.rule.manage",
  "notification.view",
  "notification.manage",
  "promotion.view",
  "promotion.manage",
  "support.ticket.create",
  "support.ticket.view",
  "support.ticket.manage",
  "support.impersonate",
  "budget.view",
  "budget.manage",
  "billing.view",
  "billing.manage",
  "ai.use",
  "ai.manage",
  "security.event.view",
  "trust.incident.view",
  "trust.incident.manage",
  "trust.incident.appeal",
  "trust.comment.view",
  "trust.comment.manage",
  "trust.review.view",
  "trust.review.create",
  "trust.review.respond",
  "trust.review.moderate",
  "trust.rating.view",
  "trust.rating.manage",
  "trust.rating.appeal",
  "geo.view",
  "geo.manage",
  "geo.verify",
  "recommendation.use",
  "promotion.placement.manage",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertSafeEnvironment() {
  if (!profiles.has(profile))
    throw new Error(
      `Usage: node scripts/seed-profile.mjs <${[...profiles].join("|")}>`,
    );
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_PRODUCTION_SEED !== "true"
  ) {
    throw new Error("Production seeding requires ALLOW_PRODUCTION_SEED=true");
  }
}

async function ensureReference() {
  const kazakhstan = await prisma.country.upsert({
    where: { code: "KZ" },
    update: { nameRu: "Казахстан", nameKk: "Қазақстан" },
    create: { code: "KZ", nameRu: "Казахстан", nameKk: "Қазақстан" },
  });
  for (const city of [
    ["ALA", "Алматы", "Алматы", "ALMATY", "Алматы", "Алматы"],
    ["AST", "Астана", "Астана", "ASTANA", "Астана", "Астана"],
    ["SHY", "Шымкент", "Шымкент", "SHYMKENT", "Шымкент", "Шымкент"],
    [
      "KAR",
      "Карагандинская область",
      "Қарағанды облысы",
      "KARAGANDA",
      "Караганда",
      "Қарағанды",
    ],
    [
      "PAV",
      "Павлодарская область",
      "Павлодар облысы",
      "PAVLODAR",
      "Павлодар",
      "Павлодар",
    ],
  ]) {
    const [regionCode, regionRu, regionKk, cityCode, cityRu, cityKk] = city;
    const region = await prisma.region.upsert({
      where: { countryId_code: { countryId: kazakhstan.id, code: regionCode } },
      update: { nameRu: regionRu, nameKk: regionKk },
      create: {
        countryId: kazakhstan.id,
        code: regionCode,
        nameRu: regionRu,
        nameKk: regionKk,
      },
    });
    await prisma.city.upsert({
      where: { regionId_code: { regionId: region.id, code: cityCode } },
      update: { nameRu: cityRu, nameKk: cityKk },
      create: {
        regionId: region.id,
        code: cityCode,
        nameRu: cityRu,
        nameKk: cityKk,
      },
    });
  }
  await prisma.industry.upsert({
    where: { code: "dentistry-kz" },
    update: { nameRu: "Стоматология", nameKk: "Стоматология" },
    create: {
      code: "dentistry-kz",
      nameRu: "Стоматология",
      nameKk: "Стоматология",
    },
  });
  for (const unit of [
    ["piece", "Штука", "Дана", "шт"],
    ["pack", "Упаковка", "Қаптама", "уп"],
    ["pair", "Пара", "Жұп", "пар"],
    ["box", "Короб", "Қорап", "кор"],
    ["gram", "Грамм", "Грамм", "г"],
    ["milliliter", "Миллилитр", "Миллилитр", "мл"],
    ["tube", "Тюбик", "Түтік", "тюб"],
    ["set", "Набор", "Жинақ", "наб"],
  ]) {
    const [code, nameRu, nameKk, symbol] = unit;
    await prisma.unitOfMeasure.upsert({
      where: { code },
      update: { nameRu, nameKk, symbol },
      create: { code, nameRu, nameKk, symbol },
    });
  }
  for (const code of permissionCodes) {
    await prisma.permission.upsert({
      where: { code },
      update: { description: code },
      create: { code, description: code },
    });
  }
  for (const flag of [
    ["ai.assistant", "Tenant-aware AI procurement assistant"],
    ["billing.enforcement", "Enforce plan limits; disabled during pilot"],
    ["promoted.offers", "Paid promoted offer placement"],
    [
      "trust.smart-commerce",
      "Verified reviews, explainable rating and geo recommendations",
    ],
    ["social.apple", "Apple social sign-in"],
    ["social.google", "Google social sign-in"],
  ]) {
    const [key, description] = flag;
    await prisma.featureFlag.upsert({
      where: { key },
      update: { description, enabled: false },
      create: { key, description, enabled: false },
    });
  }
  await prisma.documentTemplate.upsert({
    where: {
      code_version: { code: "MARKETPLACE_SUPPLIER_AGREEMENT_RU", version: 1 },
    },
    update: {},
    create: {
      code: "MARKETPLACE_SUPPLIER_AGREEMENT_RU",
      version: 1,
      kind: "MARKETPLACE_SUPPLIER_AGREEMENT",
      name: "Договор поставщика с платформой",
      format: "PDF",
      locale: "ru-KZ",
      requiredSignatureCount: 2,
      signatureMethods: ["MOCK", "EDS", "EGOV_QR"],
      templateBody: "Договор поставщика с платформой DentMarket KZ",
    },
  });
  for (const template of [
    {
      code: "ORDER_SPECIFICATION_RU",
      kind: "ORDER_SPECIFICATION",
      name: "Спецификация к заказу",
      format: "PDF",
      requiredSignatureCount: 1,
      templateBody:
        "СПЕЦИФИКАЦИЯ № {{order.number}}\n\nПоставщик: {{supplier.name}}\nБИН поставщика: {{supplier.bin}}\nПокупатель: {{buyer.name}}\nБИН покупателя: {{buyer.bin}}\nСумма: {{order.total}} {{order.currency}}\n\nСостав заказа:\n{{order.items}}\n\nДокумент сформирован DentMarket KZ из подтверждённого заказа.",
    },
    {
      code: "INVOICE_RU",
      kind: "INVOICE",
      name: "Счёт на оплату",
      format: "PDF",
      requiredSignatureCount: 0,
      templateBody:
        "СЧЁТ № {{invoice.number}}\n\nПоставщик: {{supplier.name}}\nБИН поставщика: {{supplier.bin}}\nПокупатель: {{buyer.name}}\nБИН покупателя: {{buyer.bin}}\nИтого к оплате: {{invoice.total}} {{invoice.currency}}.\n\nОснование: заказ {{order.number}}.",
    },
    {
      code: "WAYBILL_RU",
      kind: "WAYBILL",
      name: "Накладная",
      format: "DOCX",
      requiredSignatureCount: 2,
      templateBody:
        "НАКЛАДНАЯ № {{shipment.number}}\n\nПоставщик: {{supplier.name}}\nПолучатель: {{recipient.name}}\nАдрес доставки: {{recipient.address}}\nТрек-номер: {{shipment.trackingNumber}}\n\nТовары:\n{{shipment.items}}",
    },
  ]) {
    await prisma.documentTemplate.upsert({
      where: { code_version: { code: template.code, version: 1 } },
      update: {
        kind: template.kind,
        name: template.name,
        format: template.format,
        locale: "ru-KZ",
        requiredSignatureCount: template.requiredSignatureCount,
        signatureMethods: ["MOCK", "EDS", "EGOV_QR"],
        templateBody: template.templateBody,
        status: "ACTIVE",
      },
      create: {
        ...template,
        version: 1,
        locale: "ru-KZ",
        signatureMethods: ["MOCK", "EDS", "EGOV_QR"],
      },
    });
  }
}

async function ensureOperator() {
  await ensureReference();
  const organization = await prisma.organization.upsert({
    where: { bin: "000000000001" },
    update: {
      legalName: "ТОО Marketplace Operator",
      displayName: "Marketplace Operator",
      status: "ACTIVE",
    },
    create: {
      id: "00000000-0000-4000-8000-000000000001",
      bin: "000000000001",
      legalName: "ТОО Marketplace Operator",
      displayName: "Marketplace Operator",
      capabilities: { create: { capability: "MARKETPLACE_OPERATOR" } },
    },
  });
  await prisma.organizationCapability.upsert({
    where: {
      organizationId_capability: {
        organizationId: organization.id,
        capability: "MARKETPLACE_OPERATOR",
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      capability: "MARKETPLACE_OPERATOR",
    },
  });
  const user = await prisma.user.upsert({
    where: { email: "operator@marketplace.local" },
    update: { displayName: "Локальный оператор" },
    create: {
      id: "00000000-0000-4000-8000-000000000002",
      email: "operator@marketplace.local",
      displayName: "Локальный оператор",
    },
  });
  const role = await prisma.role.upsert({
    where: {
      organizationId_code: {
        organizationId: organization.id,
        code: "platform_operator",
      },
    },
    update: {
      name: "Оператор платформы",
      isSystem: true,
      permissions: {
        deleteMany: {},
        create: permissionCodes.map((code) => ({
          permission: { connect: { code } },
        })),
      },
    },
    create: {
      id: "00000000-0000-4000-8000-000000000003",
      organizationId: organization.id,
      code: "platform_operator",
      name: "Оператор платформы",
      isSystem: true,
      permissions: {
        create: permissionCodes.map((code) => ({
          permission: { connect: { code } },
        })),
      },
    },
  });
  await prisma.organizationMembership.upsert({
    where: {
      userId_organizationId: {
        userId: user.id,
        organizationId: organization.id,
      },
    },
    update: {
      status: "ACTIVE",
      roles: { deleteMany: {}, create: { roleId: role.id } },
    },
    create: {
      id: "00000000-0000-4000-8000-000000000004",
      userId: user.id,
      organizationId: organization.id,
      status: "ACTIVE",
      acceptedAt: new Date(),
      isPrimary: true,
      roles: { create: { roleId: role.id } },
    },
  });
}

async function ensureTestFixture() {
  await ensureOperator();
  const organization = await prisma.organization.upsert({
    where: { bin: "999999999901" },
    update: {
      legalName: "Test Seed Clinic",
      displayName: "Test Seed Clinic",
      status: "ACTIVE",
    },
    create: {
      id: "00000000-0000-4000-8000-000000000901",
      bin: "999999999901",
      legalName: "Test Seed Clinic",
      displayName: "Test Seed Clinic",
      capabilities: { create: { capability: "BUYER" } },
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
  const user = await prisma.user.upsert({
    where: { email: "test-seed-buyer@marketplace.local" },
    update: {},
    create: {
      id: "00000000-0000-4000-8000-000000000902",
      email: "test-seed-buyer@marketplace.local",
      displayName: "Test seed buyer",
    },
  });
  const role = await prisma.role.upsert({
    where: {
      organizationId_code: {
        organizationId: organization.id,
        code: "test_buyer",
      },
    },
    update: {
      permissions: {
        deleteMany: {},
        create: ["catalog.product.view", "order.create"].map((code) => ({
          permission: { connect: { code } },
        })),
      },
    },
    create: {
      id: "00000000-0000-4000-8000-000000000903",
      organizationId: organization.id,
      code: "test_buyer",
      name: "Test buyer",
      isSystem: true,
      permissions: {
        create: ["catalog.product.view", "order.create"].map((code) => ({
          permission: { connect: { code } },
        })),
      },
    },
  });
  await prisma.organizationMembership.upsert({
    where: {
      userId_organizationId: {
        userId: user.id,
        organizationId: organization.id,
      },
    },
    update: {
      status: "ACTIVE",
      roles: { deleteMany: {}, create: { roleId: role.id } },
    },
    create: {
      id: "00000000-0000-4000-8000-000000000904",
      userId: user.id,
      organizationId: organization.id,
      status: "ACTIVE",
      acceptedAt: new Date(),
      isPrimary: true,
      roles: { create: { roleId: role.id } },
    },
  });
}

async function manifest(name) {
  const [
    country,
    cities,
    units,
    permissions,
    templates,
    operator,
    membership,
    testOrganization,
    pilotBuyers,
    pilotSuppliers,
    pilotOffers,
    pilotCompliantOffers,
    pilotComparableGroups,
  ] = await Promise.all([
    prisma.country.count({ where: { code: "KZ" } }),
    prisma.city.count(),
    prisma.unitOfMeasure.count({
      where: {
        code: {
          in: [
            "piece",
            "pack",
            "pair",
            "box",
            "gram",
            "milliliter",
            "tube",
            "set",
          ],
        },
      },
    }),
    prisma.permission.count({ where: { code: { in: permissionCodes } } }),
    prisma.documentTemplate.count({
      where: {
        code: {
          in: [
            "MARKETPLACE_SUPPLIER_AGREEMENT_RU",
            "ORDER_SPECIFICATION_RU",
            "INVOICE_RU",
            "WAYBILL_RU",
          ],
        },
        version: 1,
      },
    }),
    prisma.organization.count({ where: { bin: "000000000001" } }),
    prisma.organizationMembership.count({
      where: {
        organization: { bin: "000000000001" },
        user: { email: "operator@marketplace.local" },
        status: "ACTIVE",
      },
    }),
    prisma.organization.count({ where: { bin: "999999999901" } }),
    prisma.organization.count({ where: { bin: { startsWith: "9700000000" } } }),
    prisma.organization.count({ where: { bin: { startsWith: "9800000000" } } }),
    prisma.supplierOffer.count({
      where: { externalId: { startsWith: "pilot-demo:" } },
    }),
    prisma.complianceCheck.findMany({
      where: {
        offer: { externalId: { startsWith: "pilot-demo:" } },
        status: "PASSED",
        decision: "ALLOWED",
        riskLevel: "GREEN",
        validUntil: { gt: new Date() },
      },
      distinct: ["offerId"],
      select: { offerId: true },
    }),
    prisma.supplierOffer.groupBy({
      by: ["productVariantId"],
      where: { externalId: { startsWith: "pilot-demo:" } },
      _count: { _all: true },
    }),
  ]);
  assert(
    country === 1 &&
      cities >= 5 &&
      units === 8 &&
      permissions === permissionCodes.length &&
      templates === 4,
    "Reference manifest failed",
  );
  if (["operator", "test", "pilot"].includes(name))
    assert(operator === 1 && membership === 1, "Operator manifest failed");
  if (name === "test")
    assert(testOrganization === 1, "Test fixture manifest failed");
  if (name === "test" && process.env.SEED_PROFILE_ASSERT_NO_PILOT === "true") {
    assert(
      pilotBuyers === 0 &&
        pilotSuppliers === 0 &&
        pilotOffers === 0 &&
        pilotCompliantOffers.length === 0 &&
        pilotComparableGroups.length === 0,
      "Test profile created or inherited pilot market data",
    );
  }
  if (name === "pilot")
    assert(
      pilotBuyers === 10 &&
        pilotSuppliers === 10 &&
        pilotOffers === 500 &&
        pilotCompliantOffers.length === 500 &&
        pilotComparableGroups.length === 50 &&
        pilotComparableGroups.every((group) => group._count._all === 10),
      "Pilot manifest failed",
    );
  console.log(
    JSON.stringify(
      {
        profile: name,
        status: "passed",
        reference: { country, cities, units, permissions, templates },
        operator: { organizations: operator, memberships: membership },
        test: { organizations: testOrganization },
        pilot: {
          buyers: pilotBuyers,
          suppliers: pilotSuppliers,
          offers: pilotOffers,
          compliantOffers: pilotCompliantOffers.length,
          comparableProducts: pilotComparableGroups.length,
        },
      },
      null,
      2,
    ),
  );
}

async function seed() {
  assertSafeEnvironment();
  if (profile === "reference") await ensureReference();
  if (profile === "operator") await ensureOperator();
  if (profile === "test") await ensureTestFixture();
  if (profile === "pilot") {
    await ensureOperator();
    const result = spawnSync(
      process.execPath,
      [path.join(root, "scripts", "seed-pilot-demo-market.mjs")],
      { cwd: root, env: process.env, stdio: "inherit" },
    );
    if (result.status !== 0)
      throw new Error(
        `Pilot data seeding failed with exit code ${result.status}`,
      );
  }
  await manifest(profile);
}

seed()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
