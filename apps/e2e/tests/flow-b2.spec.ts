import { randomUUID } from "node:crypto";
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
const buyerPermissionCodes = [
  "organization.view",
  "catalog.product.view",
  "order.create",
  "order.approve",
  "document.view",
  "notification.view",
  "trust.review.view",
  "trust.rating.view",
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
  allPermissions: boolean,
): Promise<ActorFixture> {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`.slice(-11);
  const userId = randomUUID();
  const roleId = randomUUID();
  const displayName = `B2 ${label} ${suffix}`;
  const permissions = await prisma.permission.findMany({
    where: allPermissions ? undefined : { code: "order.confirm" },
    select: { id: true },
  });
  expect(permissions.length).toBeGreaterThan(0);

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
    "No pilot offer with at least eight local-only units was found. Run `pnpm db:prepare-pilot`.",
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
  const row = page.getByRole("row").filter({ hasText: orderNumber });
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
      true,
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
      false,
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
});
