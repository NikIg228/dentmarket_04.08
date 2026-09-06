import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { resolve, sep } from "node:path";
import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";
const BUYER_URL = "http://127.0.0.1:3001";
const SUPPLIER_URL = "http://127.0.0.1:3002";
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://marketplace:marketplace@127.0.0.1:5432/marketplace?schema=public";

process.env.DATABASE_URL = databaseUrl;

const prisma = new PrismaClient();
const localStorageRoot = resolve(process.cwd(), "../..", ".local-storage");
const buyerPermissionCodes = [
  "organization.view",
  "catalog.product.view",
  "order.create",
  "order.approve",
  "document.view",
  "document.sign",
  "document.upload",
  "document.accounting.review",
  "notification.view",
  "support.ticket.create",
  "support.ticket.view",
  "budget.view",
  "budget.manage",
  "ai.use",
  "trust.incident.view",
  "trust.incident.appeal",
  "trust.comment.view",
  "trust.comment.manage",
  "trust.review.view",
  "trust.review.create",
  "trust.rating.view",
  "geo.view",
  "geo.manage",
  "recommendation.use",
];
const supplierPermissionCodes = [
  "organization.view", "catalog.product.view", "catalog.offer.edit", "catalog.offer.publish",
  "import.manage", "matching.manage", "compliance.view", "compliance.credential.manage",
  "inventory.view", "inventory.adjust", "inventory.freshness.manage", "order.confirm",
  "document.view", "document.sign", "document.upload", "document.issue",
  "document.accounting.review", "document.archive", "integration.view", "integration.manage",
  "delivery.view", "delivery.manage", "shipment.manage", "promotion.view", "promotion.manage",
  "support.ticket.create", "support.ticket.view", "ai.use", "trust.incident.view",
  "trust.incident.appeal", "trust.comment.view", "trust.comment.manage", "trust.review.view",
  "trust.review.respond", "trust.rating.view", "trust.rating.appeal", "geo.view", "geo.manage",
];

type ActorFixture = {
  organizationId: string;
  userId: string;
  roleId: string;
  displayName: string;
};

type PilotOffer = {
  id: string;
  supplierOrganizationId: string;
  productName: string;
};

type CheckoutPayload = {
  id: string;
  totalAmountMinor: string;
  supplierOrders: Array<{
    id: string;
    orderNumber: string;
    supplierOrganizationId: string;
    subtotalAmountMinor: string;
    items: Array<{
      id: string;
      quantity: string;
      unitPriceMinor: string;
    }>;
  }>;
};

type OrderDocumentPackPayload = {
  supplierOrderId: string;
  shipmentId: string;
  documents: Array<{
    id: string;
    kind: "ORDER_SPECIFICATION" | "INVOICE" | "WAYBILL";
    format: "PDF" | "DOCX";
    documentNumber: string;
    checksumSha256: string;
  }>;
};

type OrderFixture = {
  checkoutId: string;
  orderId: string;
  orderNumber: string;
  itemId: string;
  itemName: string;
  quantity: number;
  unitPriceMinor: string;
  subtotalAmountMinor: string;
  reservationId: string;
  balanceId: string;
  lotId: string | null;
  warehouseId: string;
  balanceAvailableBeforeConfirmation: number;
  balanceReservedBeforeConfirmation: number;
  lotAvailableBeforeConfirmation: number | null;
  lotReservedBeforeConfirmation: number | null;
};

let buyer: ActorFixture;
let supplier: ActorFixture;
let foreignSupplier: ActorFixture;
let offer: PilotOffer;

function assertLocalDatabase() {
  const hostname = new URL(databaseUrl).hostname;
  if (
    !["127.0.0.1", "localhost", "::1"].includes(hostname) &&
    process.env.FLOW_B2_ALLOW_REMOTE !== "true"
  )
    throw new Error(
      "Flow B2 creates temporary orders and is local-only. Set FLOW_B2_ALLOW_REMOTE=true explicitly for a non-local test database.",
    );
}

async function responseJson<T>(response: APIResponse): Promise<T> {
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as T;
}

async function createBuyerFixture(): Promise<ActorFixture> {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-10);
  const organizationId = randomUUID();
  const userId = randomUUID();
  const roleId = randomUUID();
  const displayName = `B2 Клиника ${suffix}`;
  const permissions = await prisma.permission.findMany({
    where: { code: { in: buyerPermissionCodes } },
    select: { id: true, code: true },
  });
  expect(permissions.map(({ code }) => code).sort()).toEqual(
    [...buyerPermissionCodes].sort(),
  );

  await prisma.$transaction(async (tx) => {
    await tx.organization.create({
      data: {
        id: organizationId,
        legalName: `ТОО ${displayName}`,
        displayName,
        bin: `77${suffix}`,
        capabilities: { create: { capability: "BUYER" } },
      },
    });
    await tx.user.create({
      data: {
        id: userId,
        email: `flow-b2-buyer-${suffix}@example.local`,
        displayName,
        emailVerifiedAt: new Date(),
      },
    });
    await tx.role.create({
      data: {
        id: roleId,
        organizationId,
        code: `flow_b2_buyer_${suffix}`,
        name: "Flow B2 buyer",
        permissions: {
          create: permissions.map(({ id }) => ({
            permission: { connect: { id } },
          })),
        },
      },
    });
    await tx.organizationMembership.create({
      data: {
        userId,
        organizationId,
        status: "ACTIVE",
        acceptedAt: new Date(),
        isPrimary: true,
        roles: { create: { role: { connect: { id: roleId } } } },
      },
    });
  });

  return { organizationId, userId, roleId, displayName };
}

async function createSupplierActor(
  organizationId: string,
  label: string,
): Promise<ActorFixture> {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`.slice(-11);
  const userId = randomUUID();
  const roleId = randomUUID();
  const displayName = `B2 ${label} ${suffix}`;
  const permissions = await prisma.permission.findMany({
    where: { code: { in: supplierPermissionCodes } },
    select: { id: true, code: true },
  });
  expect(permissions.map(({ code }) => code).sort()).toEqual([...supplierPermissionCodes].sort());

  await prisma.$transaction(async (tx) => {
    await tx.user.create({
      data: {
        id: userId,
        email: `flow-b2-${label}-${suffix}@example.local`,
        displayName,
        emailVerifiedAt: new Date(),
      },
    });
    await tx.role.create({
      data: {
        id: roleId,
        organizationId,
        code: `flow_b2_${label}_${suffix}`,
        name: `Flow B2 ${label}`,
        permissions: {
          create: permissions.map(({ id }) => ({
            permission: { connect: { id } },
          })),
        },
      },
    });
    await tx.organizationMembership.create({
      data: {
        userId,
        organizationId,
        status: "ACTIVE",
        acceptedAt: new Date(),
        isPrimary: true,
        roles: { create: { role: { connect: { id: roleId } } } },
      },
    });
  });

  return { organizationId, userId, roleId, displayName };
}

async function findPilotOffer(): Promise<PilotOffer> {
  const now = new Date();
  const candidates = await prisma.supplierOffer.findMany({
    where: {
      externalId: { startsWith: "pilot-demo:" },
      status: "ACTIVE",
      publication: { is: { status: "PUBLISHED", marketplaceVisible: true } },
      prices: {
        some: {
          status: "ACTIVE",
          validFrom: { lte: now },
          OR: [{ validTo: null }, { validTo: { gte: now } }],
        },
      },
      inventoryBalances: {
        some: {
          freshnessStatus: "FRESH",
          freshnessExpiresAt: { gt: now },
          quantityAvailable: { gte: 8 },
        },
      },
    },
    select: {
      id: true,
      supplierOrganizationId: true,
      productVariant: {
        select: { product: { select: { canonicalName: true } } },
      },
    },
    orderBy: [{ supplierOrganizationId: "asc" }, { id: "asc" }],
    take: 100,
  });

  for (const candidate of candidates) {
    const reservationBinding = await prisma.integrationDataBinding.findFirst({
      where: {
        dataType: "RESERVATION",
        status: "ACTIVE",
        connection: {
          supplierOrganizationId: candidate.supplierOrganizationId,
          status: { in: ["PENDING", "ACTIVE", "ERROR"] },
        },
      },
      select: { id: true },
    });
    if (!reservationBinding)
      return {
        id: candidate.id,
        supplierOrganizationId: candidate.supplierOrganizationId,
        productName: candidate.productVariant.product.canonicalName,
      };
  }
  throw new Error(
    "No pilot offer with at least eight local-only units was found. Run `npm run db:prepare-pilot`.",
  );
}

function identityHeaders(actor: ActorFixture) {
  return {
    "x-user-id": actor.userId,
    "x-organization-id": actor.organizationId,
  };
}

async function createOrder(
  request: APIRequestContext,
  scenario: string,
): Promise<OrderFixture> {
  const cart = await responseJson<{ id: string }>(
    await request.post(`${API_URL}/buyers/${buyer.organizationId}/carts`, {
      headers: identityHeaders(buyer),
      data: { currency: "KZT" },
    }),
  );
  await responseJson(
    await request.post(`${API_URL}/carts/${cart.id}/items`, {
      headers: identityHeaders(buyer),
      data: { offerId: offer.id, quantity: 4 },
    }),
  );
  const checkout = await responseJson<CheckoutPayload>(
    await request.post(`${API_URL}/carts/${cart.id}/checkout`, {
      headers: identityHeaders(buyer),
      data: { idempotencyKey: `flow-b2-${scenario}-${cart.id}` },
    }),
  );
  expect(checkout.supplierOrders).toHaveLength(1);
  const order = checkout.supplierOrders[0]!;
  expect(order.supplierOrganizationId).toBe(offer.supplierOrganizationId);
  expect(order.items).toHaveLength(1);

  const persisted = await prisma.supplierOrder.findUniqueOrThrow({
    where: { id: order.id },
    include: {
      items: {
        include: {
          offer: {
            include: { productVariant: { include: { product: true } } },
          },
          reservation: {
            include: {
              inventoryBalance: true,
              inventoryLot: true,
              externalReservation: true,
            },
          },
        },
      },
    },
  });
  const item = persisted.items[0]!;
  expect(item.reservation?.status).toBe("ACTIVE");
  expect(item.reservation?.externalReservation).toBeNull();

  return {
    checkoutId: checkout.id,
    orderId: order.id,
    orderNumber: order.orderNumber,
    itemId: item.id,
    itemName: item.offer.productVariant.product.canonicalName,
    quantity: Number(item.quantity),
    unitPriceMinor: item.unitPriceMinor.toString(),
    subtotalAmountMinor: item.totalPriceMinor.toString(),
    reservationId: item.reservation!.id,
    balanceId: item.reservation!.inventoryBalanceId,
    lotId: item.reservation!.inventoryLotId,
    warehouseId: item.warehouseId,
    balanceAvailableBeforeConfirmation: Number(
      item.reservation!.inventoryBalance.quantityAvailable,
    ),
    balanceReservedBeforeConfirmation: Number(
      item.reservation!.inventoryBalance.quantityReserved,
    ),
    lotAvailableBeforeConfirmation: item.reservation!.inventoryLot
      ? Number(item.reservation!.inventoryLot.quantityAvailable)
      : null,
    lotReservedBeforeConfirmation: item.reservation!.inventoryLot
      ? Number(item.reservation!.inventoryLot.quantityReserved)
      : null,
  };
}

function collectBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 500)
      errors.push(`${response.status()} ${response.url()}`);
  });
  return errors;
}

async function openNavigationIfCollapsed(page: Page) {
  if ((page.viewportSize()?.width ?? 1_280) > 650) return;
  const trigger = page.getByRole("button", { name: "Открыть меню" });
  await expect(trigger).toBeVisible();
  await trigger.click();
}

async function openSupplierOrder(page: Page, orderNumber: string) {
  const handoff = encodeURIComponent(
    JSON.stringify({
      actorId: supplier.userId,
      organizationId: supplier.organizationId,
      displayName: supplier.displayName,
      organizationDisplayName: supplier.displayName,
      capability: "SUPPLIER",
    }),
  );
  await page.goto(`${SUPPLIER_URL}/#session=${handoff}`);
  await expect(
    page.getByRole("combobox", { name: "Организация поставщика" }),
  ).toHaveValue(supplier.organizationId);
  await openNavigationIfCollapsed(page);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /^Заказы/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Заказы покупателей" }),
  ).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: orderNumber }).first();
  await expect(row).toBeVisible();
  return row;
}

async function assertDecisionEvidence(orderId: string) {
  expect(
    await prisma.auditLog.count({
      where: {
        action: "supplier_order.confirmed",
        entityType: "SupplierOrder",
        entityId: orderId,
      },
    }),
  ).toBe(1);
  expect(
    await prisma.outboxEvent.count({
      where: {
        aggregateType: "SupplierOrder",
        aggregateId: orderId,
        eventType: "SupplierOrderConfirmed",
      },
    }),
  ).toBe(1);
}

async function openBuyerOrders(page: Page) {
  const handoff = encodeURIComponent(
    JSON.stringify({
      actorId: buyer.userId,
      organizationId: buyer.organizationId,
      displayName: buyer.displayName,
      organizationDisplayName: buyer.displayName,
      capability: "BUYER",
    }),
  );
  await page.goto(`${BUYER_URL}/#session=${handoff}`);
  await openNavigationIfCollapsed(page);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: /^Заказы/ })
    .click();
  await expect(page.getByRole("heading", { name: "Заказы" })).toBeVisible();
}

async function restoreInventoryAndDeleteFixtures() {
  if (!buyer) return;
  const checkouts = await prisma.checkout.findMany({
    where: { buyerOrganizationId: buyer.organizationId },
    select: { id: true },
  });
  const carts = await prisma.cart.findMany({
    where: { buyerOrganizationId: buyer.organizationId },
    select: { id: true },
  });
  const orders = await prisma.supplierOrder.findMany({
    where: { buyerOrganizationId: buyer.organizationId },
    select: { id: true },
  });
  const shipments = await prisma.shipment.findMany({
    where: { supplierOrderId: { in: orders.map(({ id }) => id) } },
    select: { id: true },
  });
  const documents = await prisma.document.findMany({
    where: { supplierOrderId: { in: orders.map(({ id }) => id) } },
    select: { id: true, storageKey: true },
  });
  const reservations = await prisma.inventoryReservation.findMany({
    where: {
      supplierOrderItem: {
        is: { supplierOrder: { buyerOrganizationId: buyer.organizationId } },
      },
    },
  });
  const complianceChecks = await prisma.complianceCheck.findMany({
    where: { buyerOrganizationId: buyer.organizationId },
    select: { id: true },
  });
  const checkoutIds = checkouts.map(({ id }) => id);
  const cartIds = carts.map(({ id }) => id);
  const orderIds = orders.map(({ id }) => id);
  const shipmentIds = shipments.map(({ id }) => id);
  const documentIds = documents.map(({ id }) => id);
  const reservationIds = reservations.map(({ id }) => id);
  const complianceCheckIds = complianceChecks.map(({ id }) => id);

  await prisma.$transaction(async (tx) => {
    for (const reservation of reservations) {
      if (reservation.status !== "ACTIVE") continue;
      await tx.inventoryBalance.update({
        where: { id: reservation.inventoryBalanceId },
        data: {
          quantityAvailable: { increment: reservation.quantity },
          quantityReserved: { decrement: reservation.quantity },
          availabilityStatus: "IN_STOCK",
          version: { increment: 1 },
        },
      });
      if (reservation.inventoryLotId)
        await tx.inventoryLot.update({
          where: { id: reservation.inventoryLotId },
          data: {
            quantityAvailable: { increment: reservation.quantity },
            quantityReserved: { decrement: reservation.quantity },
            version: { increment: 1 },
          },
        });
    }
    await tx.inventoryReservation.deleteMany({
      where: { id: { in: reservationIds } },
    });
    await tx.notification.deleteMany({
      where: {
        OR: [
          { recipientOrganizationId: buyer.organizationId },
          { aggregateId: { in: [...orderIds, ...shipmentIds] } },
          { aggregateId: { in: documentIds } },
        ],
      },
    });
    await tx.outboxEvent.deleteMany({
      where: {
        aggregateId: {
          in: [
            ...checkoutIds,
            ...orderIds,
            ...shipmentIds,
            ...documentIds,
            ...reservationIds,
            ...complianceCheckIds,
          ],
        },
      },
    });
    await tx.auditLog.deleteMany({
      where: {
        OR: [
          { organizationId: buyer.organizationId },
          { actorId: { in: [supplier.userId, foreignSupplier.userId] } },
          {
            entityId: {
              in: [
                ...checkoutIds,
                ...orderIds,
                ...shipmentIds,
                ...cartIds,
                ...reservationIds,
                ...documentIds,
              ],
            },
          },
        ],
      },
    });
    await tx.searchQueryEvent.deleteMany({
      where: { organizationId: buyer.organizationId },
    });
    await tx.complianceCheck.deleteMany({
      where: { id: { in: complianceCheckIds } },
    });
    await tx.document.deleteMany({ where: { id: { in: documentIds } } });
    await tx.shipment.deleteMany({
      where: { id: { in: shipmentIds } },
    });
    await tx.supplierOrder.deleteMany({
      where: { buyerOrganizationId: buyer.organizationId },
    });
    await tx.checkout.deleteMany({
      where: { buyerOrganizationId: buyer.organizationId },
    });
    await tx.cart.deleteMany({
      where: { buyerOrganizationId: buyer.organizationId },
    });
    await tx.role.deleteMany({
      where: { id: { in: [supplier.roleId, foreignSupplier.roleId] } },
    });
    await tx.user.deleteMany({
      where: { id: { in: [supplier.userId, foreignSupplier.userId] } },
    });
    await tx.organization.delete({ where: { id: buyer.organizationId } });
    await tx.user.delete({ where: { id: buyer.userId } });
  });

  for (const document of documents) {
    if (!document.storageKey) continue;
    const path = resolve(localStorageRoot, document.storageKey);
    if (!path.startsWith(`${localStorageRoot}${sep}`)) throw new Error("Unsafe Flow B2 storage cleanup path");
    await unlink(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }

  expect(
    await prisma.supplierOrder.count({
      where: { buyerOrganizationId: buyer.organizationId },
    }),
  ).toBe(0);
  expect(
    await prisma.inventoryReservation.count({
      where: { id: { in: reservationIds } },
    }),
  ).toBe(0);
  expect(
    await prisma.notification.count({
      where: { aggregateId: { in: [...orderIds, ...shipmentIds] } },
    }),
  ).toBe(0);
  expect(await prisma.document.count({ where: { id: { in: documentIds } } })).toBe(0);
}

test.describe.serial("@flow-b2 supplier order confirmation", () => {
  test.beforeAll(async () => {
    assertLocalDatabase();
    await prisma.$queryRaw`SELECT 1`;
    buyer = await createBuyerFixture();
    offer = await findPilotOffer();
    supplier = await createSupplierActor(
      offer.supplierOrganizationId,
      "supplier",
    );
    const anotherSupplier = await prisma.organization.findFirst({
      where: {
        id: { not: offer.supplierOrganizationId },
        capabilities: { some: { capability: "SUPPLIER" } },
      },
      select: { id: true },
    });
    if (!anotherSupplier)
      throw new Error("A second pilot supplier is required for tenant checks.");
    foreignSupplier = await createSupplierActor(
      anotherSupplier.id,
      "foreign",
    );
  });

  test.afterAll(async () => {
    try {
      await restoreInventoryAndDeleteFixtures();
    } finally {
      await prisma.$disconnect();
    }
  });

  test("supplier fully confirms an order with idempotency and tenant isolation", async ({
    page,
    request,
  }) => {
    const errors = collectBrowserErrors(page);
    const order = await createOrder(request, "full");
    const decisions = [
      { itemId: order.itemId, acceptedQuantity: order.quantity },
    ];

    const forbidden = await request.post(
      `${API_URL}/supplier-orders/${order.orderId}/confirm`,
      { headers: identityHeaders(foreignSupplier), data: { decisions } },
    );
    expect(forbidden.status()).toBe(403);

    const row = await openSupplierOrder(page, order.orderNumber);
    await row.getByRole("button", { name: "Проверить и подтвердить" }).click();
    const dialog = page.getByRole("dialog", {
      name: `Подтверждение заказа ${order.orderNumber}`,
    });
    await expect(dialog).toContainText("Заказ подтверждается полностью");
    await dialog.getByRole("button", { name: "Подтвердить заказ" }).click();
    await expect(row).toContainText("Подтверждено");

    const repeated = await Promise.all([
      request.post(`${API_URL}/supplier-orders/${order.orderId}/confirm`, {
        headers: identityHeaders(supplier),
        data: { decisions },
      }),
      request.post(`${API_URL}/supplier-orders/${order.orderId}/confirm`, {
        headers: identityHeaders(supplier),
        data: { decisions },
      }),
    ]);
    expect(repeated.every((response) => response.ok())).toBe(true);

    const persisted = await prisma.supplierOrder.findUniqueOrThrow({
      where: { id: order.orderId },
      include: { checkout: true, items: { include: { reservation: true } } },
    });
    expect(persisted.status).toBe("CONFIRMED");
    expect(persisted.subtotalAmountMinor.toString()).toBe(
      order.subtotalAmountMinor,
    );
    expect(persisted.checkout.totalAmountMinor.toString()).toBe(
      order.subtotalAmountMinor,
    );
    expect(persisted.items[0]?.acceptedQuantity.toString()).toBe("4");
    expect(persisted.items[0]?.decisionReason).toBeNull();
    expect(persisted.items[0]?.reservation?.quantity.toString()).toBe("4");
    await assertDecisionEvidence(order.orderId);
    expect(errors).toEqual([]);
  });

  test("supplier partially confirms and buyer sees the reason and final total", async ({
    page,
    request,
  }) => {
    const errors = collectBrowserErrors(page);
    const order = await createOrder(request, "partial");
    const acceptedQuantity = 2;
    const reason = "На складе доступно только 2 упаковки";
    const expectedSubtotal = (
      BigInt(order.unitPriceMinor) * BigInt(acceptedQuantity)
    ).toString();

    const row = await openSupplierOrder(page, order.orderNumber);
    await row.getByRole("button", { name: "Проверить и подтвердить" }).click();
    const dialog = page.getByRole("dialog", {
      name: `Подтверждение заказа ${order.orderNumber}`,
    });
    await dialog
      .getByRole("spinbutton", {
        name: `Подтверждаемое количество: ${order.itemName}`,
      })
      .fill(String(acceptedQuantity));
    await dialog
      .getByRole("textbox", { name: `Причина изменения: ${order.itemName}` })
      .fill(reason);
    await expect(dialog).toContainText("Уменьшение:");
    await dialog.getByRole("button", { name: "Подтвердить заказ" }).click();
    await expect(row).toContainText("Частично подтверждено");

    const persisted = await prisma.supplierOrder.findUniqueOrThrow({
      where: { id: order.orderId },
      include: { checkout: true, items: { include: { reservation: true } } },
    });
    expect(persisted.status).toBe("PARTIALLY_CONFIRMED");
    expect(persisted.subtotalAmountMinor.toString()).toBe(expectedSubtotal);
    expect(persisted.checkout.totalAmountMinor.toString()).toBe(
      expectedSubtotal,
    );
    expect(persisted.items[0]?.acceptedQuantity.toString()).toBe("2");
    expect(persisted.items[0]?.decisionReason).toBe(reason);
    expect(persisted.items[0]?.reservation?.quantity.toString()).toBe("2");

    const balance = await prisma.inventoryBalance.findUniqueOrThrow({
      where: { id: order.balanceId },
    });
    expect(Number(balance.quantityAvailable)).toBe(
      order.balanceAvailableBeforeConfirmation + 2,
    );
    expect(Number(balance.quantityReserved)).toBe(
      order.balanceReservedBeforeConfirmation - 2,
    );
    if (order.lotId) {
      const lot = await prisma.inventoryLot.findUniqueOrThrow({
        where: { id: order.lotId },
      });
      expect(Number(lot.quantityAvailable)).toBe(
        order.lotAvailableBeforeConfirmation! + 2,
      );
      expect(Number(lot.quantityReserved)).toBe(
        order.lotReservedBeforeConfirmation! - 2,
      );
    }
    await assertDecisionEvidence(order.orderId);

    await openBuyerOrders(page);
    const buyerOrder = page.getByRole("row").filter({
      hasText: order.orderNumber,
    });
    await expect(buyerOrder).toContainText("Частично подтверждено");
    await expect(page.getByText("Подтверждено: 2 из 4")).toBeVisible();
    await expect(page.getByText(`Причина: ${reason}`)).toBeVisible();
    await expect(page.getByText(`Новый итог:`)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("supplier dispatches a paid order and buyer sees shipment notification with audit evidence", async ({
    page,
    request,
  }) => {
    const errors = collectBrowserErrors(page);
    const order = await createOrder(request, "shipment");
    const decisions = [{ itemId: order.itemId, acceptedQuantity: order.quantity }];
    await responseJson(
      await request.post(`${API_URL}/supplier-orders/${order.orderId}/confirm`, {
        headers: identityHeaders(supplier),
        data: { decisions },
      }),
    );
    await prisma.supplierOrder.update({
      where: { id: order.orderId },
      data: { paymentStatus: "PAID", status: "PAID", version: { increment: 1 } },
    });

    await openSupplierOrder(page, order.orderNumber);
    const shipmentPanel = page.getByRole("region", {
      name: `Отгрузки заказа ${order.orderNumber}`,
    });
    await expect(shipmentPanel).toContainText("Отгрузка ещё не создана");
    await shipmentPanel.getByRole("textbox", { name: "Перевозчик (необязательно)" }).fill("Flow B2 Carrier");
    await shipmentPanel.getByRole("button", { name: "Создать отгрузку" }).click();
    await expect(shipmentPanel).toContainText("Отгрузка создана");

    await shipmentPanel.getByRole("button", { name: "Запланировать" }).click();
    await expect(shipmentPanel).toContainText("Запланировано");
    await shipmentPanel.getByRole("button", { name: "Начать сборку" }).click();
    await expect(shipmentPanel).toContainText("Собирается");
    await shipmentPanel.getByRole("button", { name: "Готово к отправке" }).click();
    await expect(shipmentPanel.getByText("Готово", { exact: true })).toBeVisible();

    const readyShipment = await prisma.shipment.findFirstOrThrow({
      where: { supplierOrderId: order.orderId },
    });
    const forbidden = await request.post(
      `${API_URL}/shipments/${readyShipment.id}/transitions`,
      {
        headers: identityHeaders(foreignSupplier),
        data: {
          version: readyShipment.version,
          status: "DISPATCHED",
          trackingNumber: "FORBIDDEN-TRACK",
        },
      },
    );
    expect(forbidden.status()).toBe(403);

    const trackingNumber = `B2-${Date.now()}`;
    await shipmentPanel.getByRole("textbox", { name: new RegExp(`Трек-номер: ${readyShipment.shipmentNumber}`) }).fill(trackingNumber);
    await shipmentPanel.getByRole("button", { name: "Передать перевозчику" }).click();
    await expect(shipmentPanel).toContainText("Передано перевозчику");
    await expect(shipmentPanel).toContainText(trackingNumber);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(shipmentPanel).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    const stale = await request.post(
      `${API_URL}/shipments/${readyShipment.id}/transitions`,
      {
        headers: identityHeaders(supplier),
        data: { version: readyShipment.version, status: "IN_TRANSIT" },
      },
    );
    expect(stale.status()).toBe(409);

    const persisted = await prisma.shipment.findUniqueOrThrow({
      where: { id: readyShipment.id },
      include: { supplierOrder: true },
    });
    expect(persisted.status).toBe("DISPATCHED");
    expect(persisted.trackingNumber).toBe(trackingNumber);
    expect(persisted.supplierOrder.status).toBe("SHIPPED");
    expect(
      await prisma.auditLog.count({
        where: {
          entityType: "Shipment",
          entityId: persisted.id,
          action: "shipment.status_changed",
        },
      }),
    ).toBe(4);
    expect(
      await prisma.outboxEvent.count({
        where: {
          aggregateType: "Shipment",
          aggregateId: persisted.id,
          eventType: "ShipmentStatusChanged",
        },
      }),
    ).toBe(4);

    await expect
      .poll(
        () =>
          prisma.notification.count({
            where: {
              recipientOrganizationId: buyer.organizationId,
              aggregateId: persisted.id,
              eventType: "ShipmentStatusChanged",
              body: { contains: trackingNumber },
            },
          }),
        { timeout: 20_000 },
      )
      .toBe(1);

    await openBuyerOrders(page);
    const buyerOrder = page.getByRole("row").filter({ hasText: order.orderNumber }).first();
    await expect(buyerOrder).toContainText("Отправлено");
    const buyerShipment = page.getByRole("region", { name: "Статусы отгрузок" });
    await expect(buyerShipment).toContainText(readyShipment.shipmentNumber);
    await expect(buyerShipment).toContainText("Передано перевозчику");
    await expect(buyerShipment).toContainText(trackingNumber);

    await openNavigationIfCollapsed(page);
    await page
      .getByRole("navigation")
      .getByRole("button", { name: /^Уведомления/ })
      .click();
    await expect(page.getByRole("heading", { name: "Уведомления" })).toBeVisible();
    const notification = page.locator("article").filter({ hasText: trackingNumber });
    await expect(notification).toContainText("Статус доставки изменён");
    await expect(notification).toContainText(readyShipment.shipmentNumber);
    await expect(notification).toContainText(order.orderNumber);
    expect(errors).toEqual([]);
  });

  test("supplier generates an idempotent order document pack and buyer downloads the same evidence", async ({
    page,
    request,
  }) => {
    const errors = collectBrowserErrors(page);
    const order = await createOrder(request, "documents");
    await responseJson(
      await request.post(`${API_URL}/supplier-orders/${order.orderId}/confirm`, {
        headers: identityHeaders(supplier),
        data: { decisions: [{ itemId: order.itemId, acceptedQuantity: order.quantity }] },
      }),
    );
    const prepared = await responseJson<{ supplierOrderId: string; documents: Array<{ id: string; kind: string }> }>(
      await request.post(`${API_URL}/supplier-orders/${order.orderId}/documents/prepare`, {
        headers: identityHeaders(supplier),
        data: {},
      }),
    );
    expect(prepared.supplierOrderId).toBe(order.orderId);
    expect(prepared.documents.map(({ kind }) => kind).sort()).toEqual(["INVOICE", "ORDER_SPECIFICATION"]);
    const preparedAgain = await responseJson<{ documents: Array<{ id: string }> }>(
      await request.post(`${API_URL}/supplier-orders/${order.orderId}/documents/prepare`, {
        headers: identityHeaders(supplier),
        data: {},
      }),
    );
    expect(preparedAgain.documents.map(({ id }) => id).sort()).toEqual(prepared.documents.map(({ id }) => id).sort());
    await prisma.supplierOrder.update({
      where: { id: order.orderId },
      data: { paymentStatus: "PAID", status: "PAID", version: { increment: 1 } },
    });

    let shipment = await responseJson<{
      id: string;
      version: number;
      status: string;
      shipmentNumber: string;
    }>(
      await request.post(`${API_URL}/supplier-orders/${order.orderId}/shipments`, {
        headers: identityHeaders(supplier),
        data: {
          warehouseId: order.warehouseId,
          method: "CARRIER",
          recipientName: buyer.displayName,
          destinationAddress: { line1: "г. Алматы, ул. Тестовая, 10" },
          carrierName: "Flow B2 Documents Carrier",
          items: [{ supplierOrderItemId: order.itemId, quantity: order.quantity }],
          fulfillmentSteps: [],
        },
      }),
    );
    for (const status of ["PLANNED", "PACKING", "READY", "DISPATCHED"] as const) {
      shipment = await responseJson(
        await request.post(`${API_URL}/shipments/${shipment.id}/transitions`, {
          headers: identityHeaders(supplier),
          data: {
            version: shipment.version,
            status,
            carrierName: "Flow B2 Documents Carrier",
            trackingNumber: status === "DISPATCHED" ? `DOC-${Date.now()}` : undefined,
          },
        }),
      );
    }

    const forbidden = await request.post(
      `${API_URL}/supplier-orders/${order.orderId}/document-pack`,
      { headers: identityHeaders(foreignSupplier), data: { shipmentId: shipment.id } },
    );
    expect(forbidden.status()).toBe(403);

    await openSupplierOrder(page, order.orderNumber);
    const supplierPanel = page.getByRole("region", {
      name: `Документы заказа ${order.orderNumber}`,
    });
    await expect(supplierPanel).toContainText("2/3");
    await supplierPanel.getByRole("button", { name: "Сформировать документы" }).click();
    await expect(supplierPanel).toContainText("3/3");
    await expect(supplierPanel).toContainText("Спецификация");
    await expect(supplierPanel).toContainText("Счёт");
    await expect(supplierPanel).toContainText("Накладная");

    const repeated = await responseJson<OrderDocumentPackPayload>(
      await request.post(`${API_URL}/supplier-orders/${order.orderId}/document-pack`, {
        headers: identityHeaders(supplier),
        data: { shipmentId: shipment.id },
      }),
    );
    expect(repeated.documents).toHaveLength(3);

    const persisted = await prisma.document.findMany({
      where: { supplierOrderId: order.orderId },
      orderBy: { kind: "asc" },
    });
    expect(persisted).toHaveLength(3);
    expect(persisted.map(({ id }) => id).sort()).toEqual(repeated.documents.map(({ id }) => id).sort());
    expect(persisted.map(({ kind }) => kind).sort()).toEqual(["INVOICE", "ORDER_SPECIFICATION", "WAYBILL"]);
    for (const document of persisted) {
      expect(document.ownerOrganizationId).toBe(supplier.organizationId);
      expect(document.checkoutId).toBe(order.checkoutId);
      expect(document.shipmentId).toBe(document.kind === "WAYBILL" ? shipment.id : null);
      expect(document.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(document.immutableAt).not.toBeNull();
      expect(document.storageKey).toContain(`documents/${supplier.organizationId}/`);
      expect(document.dataSnapshot).toMatchObject({ order: { number: order.orderNumber, currency: "KZT" } });
      if (document.kind === "WAYBILL") expect(document.dataSnapshot).toMatchObject({ recipient: { address: "г. Алматы, ул. Тестовая, 10" } });
    }
    expect(
      await prisma.auditLog.count({
        where: { action: "document.generated", entityType: "Document", entityId: { in: persisted.map(({ id }) => id) } },
      }),
    ).toBe(3);
    expect(
      await prisma.outboxEvent.count({
        where: { aggregateType: "Document", aggregateId: { in: persisted.map(({ id }) => id) }, eventType: "DocumentGenerated" },
      }),
    ).toBe(3);

    const invoice = persisted.find(({ kind }) => kind === "INVOICE")!;
    const archive = await responseJson<{ items: Array<{ id: string; kind: string; accountingStatus: string; updatedAt: string; participants: Array<{ organizationId: string; organization: { displayName: string } }> }> }>(
      await request.get(`${API_URL}/documents/archive?supplierOrderId=${order.orderId}`, { headers: identityHeaders(buyer) }),
    );
    expect(archive.items).toHaveLength(3);
    expect(archive.items.every(({ participants }) => participants.some(({ organizationId }) => organizationId === buyer.organizationId) && participants.some(({ organizationId }) => organizationId === supplier.organizationId))).toBe(true);
    const foreignArchiveRead = await request.get(`${API_URL}/documents/archive/${invoice.id}`, { headers: identityHeaders(foreignSupplier) });
    expect(foreignArchiveRead.status()).toBe(404);
    const archiveInvoice = archive.items.find(({ id }) => id === invoice.id)!;
    const supplierOrganizationName = archiveInvoice.participants.find(({ organizationId }) => organizationId === supplier.organizationId)!.organization.displayName;
    const reviewedInvoice = await responseJson<{ accountingStatus: string }>(
      await request.patch(`${API_URL}/documents/archive/${invoice.id}/accounting-status`, {
        headers: identityHeaders(buyer),
        data: { status: "REVIEWED", reason: "Flow B2 accounting review", expectedUpdatedAt: archiveInvoice.updatedAt },
      }),
    );
    expect(reviewedInvoice.accountingStatus).toBe("REVIEWED");
    const staleAccountingUpdate = await request.patch(`${API_URL}/documents/archive/${invoice.id}/accounting-status`, {
      headers: identityHeaders(buyer),
      data: { status: "RECONCILED", reason: "Stale Flow B2 update", expectedUpdatedAt: archiveInvoice.updatedAt },
    });
    expect(staleAccountingUpdate.status()).toBe(409);
    const invoiceDownload = await request.get(`${API_URL}/documents/${invoice.id}/download`, {
      headers: identityHeaders(buyer),
    });
    expect(invoiceDownload.ok()).toBe(true);
    expect(invoiceDownload.headers().etag).toBe(invoice.checksumSha256);
    expect((await invoiceDownload.body()).subarray(0, 4).toString()).toBe("%PDF");
    const waybill = persisted.find(({ kind }) => kind === "WAYBILL")!;
    const waybillDownload = await request.get(`${API_URL}/documents/${waybill.id}/download`, {
      headers: identityHeaders(buyer),
    });
    expect(waybillDownload.ok()).toBe(true);
    expect((await waybillDownload.body()).subarray(0, 2).toString()).toBe("PK");

    await openBuyerOrders(page);
    const buyerPanel = page.getByRole("region", {
      name: `Документы заказа ${order.orderNumber}`,
    });
    await expect(buyerPanel).toContainText("3/3");
    await expect(buyerPanel).toContainText("Спецификация");
    await expect(buyerPanel).toContainText("Счёт");
    await expect(buyerPanel).toContainText("Накладная");
    const downloadPromise = page.waitForEvent("download");
    await buyerPanel.locator("article").filter({ hasText: "Счёт" }).getByRole("button", { name: "Скачать" }).click();
    const browserDownload = await downloadPromise;
    expect(browserDownload.suggestedFilename()).toContain(`INV-${order.orderNumber}`);

    await page.goto(`${BUYER_URL}/documents`);
    await expect(page.getByRole("heading", { name: "Документы", exact: true })).toBeVisible();
    const buyerArchiveRow = page.getByRole("row").filter({ hasText: order.orderNumber }).filter({ hasText: "Счёт" }).first();
    await expect(buyerArchiveRow).toContainText(supplierOrganizationName);
    await expect(buyerArchiveRow).toContainText("Проверен");
    await buyerArchiveRow.getByRole("button", { name: /^Счёт по заказу/ }).click();
    await expect(page.getByRole("dialog")).toContainText(order.orderNumber);
    await page.getByRole("dialog").getByRole("button", { name: "Закрыть" }).last().click();

    const supplierHandoff = encodeURIComponent(JSON.stringify({ actorId: supplier.userId, organizationId: supplier.organizationId, displayName: supplier.displayName, organizationDisplayName: supplier.displayName, capability: "SUPPLIER" }));
    await page.goto(`${SUPPLIER_URL}/documents#session=${supplierHandoff}`);
    await expect(page.getByRole("heading", { name: "Документы", exact: true })).toBeVisible();
    const supplierArchiveRow = page.getByRole("row").filter({ hasText: order.orderNumber }).filter({ hasText: "Счёт" }).first();
    await expect(supplierArchiveRow).toContainText(buyer.displayName);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(supplierArchiveRow).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
});
