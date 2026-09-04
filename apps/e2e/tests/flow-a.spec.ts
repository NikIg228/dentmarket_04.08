import { randomUUID } from "node:crypto";
import { expect, test, type APIResponse, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";
const BUYER_URL = "http://127.0.0.1:3001";
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

type BuyerFixture = {
  organizationId: string;
  userId: string;
  displayName: string;
};

type PilotProduct = {
  id: string;
  name: string;
};

type CheckoutPayload = {
  id: string;
  cartId: string;
  status: string;
  idempotencyKey: string;
  supplierOrders: Array<{
    id: string;
    orderNumber: string;
    supplierOrganizationId: string;
    items: Array<{ id: string }>;
  }>;
};

let buyer: BuyerFixture;
let pilotProduct: PilotProduct;

function assertLocalDatabase() {
  const hostname = new URL(databaseUrl).hostname;
  if (
    !["127.0.0.1", "localhost", "::1"].includes(hostname) &&
    process.env.FLOW_A_ALLOW_REMOTE !== "true"
  ) {
    throw new Error(
      "Flow A creates temporary orders and is local-only. Set FLOW_A_ALLOW_REMOTE=true explicitly for a non-local test database.",
    );
  }
}

async function createBuyerFixture(): Promise<BuyerFixture> {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-10);
  const organizationId = randomUUID();
  const userId = randomUUID();
  const roleId = randomUUID();
  const membershipId = randomUUID();
  const displayName = `E2E Клиника ${suffix}`;
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
        bin: `88${suffix}`,
        capabilities: { create: { capability: "BUYER" } },
      },
    });
    await tx.user.create({
      data: {
        id: userId,
        email: `flow-a-${suffix}@example.local`,
        displayName,
        emailVerifiedAt: new Date(),
      },
    });
    await tx.role.create({
      data: {
        id: roleId,
        organizationId,
        code: "flow_a_buyer",
        name: "Flow A buyer",
        permissions: {
          create: permissions.map(({ id }) => ({
            permission: { connect: { id } },
          })),
        },
      },
    });
    await tx.organizationMembership.create({
      data: {
        id: membershipId,
        userId,
        organizationId,
        status: "ACTIVE",
        acceptedAt: new Date(),
        isPrimary: true,
        roles: { create: { role: { connect: { id: roleId } } } },
      },
    });
  });

  return { organizationId, userId, displayName };
}

async function findComparablePilotProduct(): Promise<PilotProduct> {
  const now = new Date();
  const offers = await prisma.supplierOffer.findMany({
    where: {
      externalId: { startsWith: "pilot-demo:" },
      status: "ACTIVE",
      publication: {
        is: { status: "PUBLISHED", marketplaceVisible: true },
      },
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
          quantityAvailable: { gte: 2 },
        },
      },
    },
    select: {
      supplierOrganizationId: true,
      productVariant: {
        select: {
          product: { select: { id: true, canonicalName: true } },
        },
      },
    },
    orderBy: [{ productVariantId: "asc" }, { supplierOrganizationId: "asc" }],
  });

  const products = new Map<string, { name: string; suppliers: Set<string> }>();
  for (const offer of offers) {
    const product = offer.productVariant.product;
    const current = products.get(product.id) ?? {
      name: product.canonicalName,
      suppliers: new Set<string>(),
    };
    current.suppliers.add(offer.supplierOrganizationId);
    products.set(product.id, current);
  }
  const comparable = [...products.entries()].find(
    ([, value]) => value.suppliers.size >= 2,
  );
  if (!comparable) {
    throw new Error(
      "No pilot product with two fresh published offers was found. Run `npm run db:prepare-pilot`.",
    );
  }
  return { id: comparable[0], name: comparable[1].name };
}

async function restoreInventoryAndDeleteFixture() {
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
  const orderIds = orders.map(({ id }) => id);
  const checkoutIds = checkouts.map(({ id }) => id);
  const cartIds = carts.map(({ id }) => id);
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
      if (reservation.inventoryLotId) {
        await tx.inventoryLot.update({
          where: { id: reservation.inventoryLotId },
          data: {
            quantityAvailable: { increment: reservation.quantity },
            quantityReserved: { decrement: reservation.quantity },
            version: { increment: 1 },
          },
        });
      }
    }
    await tx.inventoryReservation.deleteMany({
      where: { id: { in: reservationIds } },
    });
    await tx.outboxEvent.deleteMany({
      where: {
        aggregateId: {
          in: [
            ...checkoutIds,
            ...orderIds,
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
          { entityId: { in: [...checkoutIds, ...orderIds, ...cartIds] } },
        ],
      },
    });
    await tx.searchQueryEvent.deleteMany({
      where: { organizationId: buyer.organizationId },
    });
    await tx.complianceCheck.deleteMany({
      where: { id: { in: complianceCheckIds } },
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
    await tx.organization.delete({ where: { id: buyer.organizationId } });
    await tx.user.delete({ where: { id: buyer.userId } });
  });
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

async function responseJson<T>(response: APIResponse): Promise<T> {
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as T;
}

async function openBuyer(page: Page) {
  await page.addInitScript(({ organizationId, userId, displayName }) => {
    window.sessionStorage.setItem(
      "dentmarket:buyer-session",
      JSON.stringify({
        actorId: userId,
        organizationId,
        displayName,
        organizationDisplayName: displayName,
        capability: "BUYER",
      }),
    );
  }, buyer);
  await page.goto(BUYER_URL);
  await expect(
    page.getByRole("heading", {
      name: "Закупки для стоматологии без лишних звонков",
    }),
  ).toBeVisible();
}

async function searchAndOpenComparison(page: Page) {
  const searchResponse = page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "GET" &&
        url.pathname.endsWith("/api/marketplace/search")
      );
    },
  );
  await page
    .getByRole("textbox", { name: "Поиск по каталогу" })
    .fill(pilotProduct.name);
  await page.getByRole("button", { name: "Найти", exact: true }).click();
  expect((await searchResponse).ok()).toBeTruthy();

  const productCard = page
    .getByTestId("product-card")
    .filter({ hasText: pilotProduct.name })
    .first();
  await expect(productCard).toBeVisible();
  await expect(productCard).toHaveAttribute("data-product-id", pilotProduct.id);
  await productCard.getByRole("button", { name: /Смотреть/ }).click();
  const dialog = page.getByRole("dialog", { name: pilotProduct.name });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Выберите продавца" }),
  ).toBeVisible();
  return dialog;
}

async function addOffersToCart(page: Page, supplierCount: number) {
  const dialog = await searchAndOpenComparison(page);
  const addButtons = dialog.getByRole("button", { name: "В корзину" });
  await expect(addButtons).toHaveCount(8);
  await expect(
    dialog.getByRole("button", { name: "Недоступно" }),
  ).toHaveCount(2);
  let cartId = "";
  for (let index = 0; index < supplierCount; index += 1) {
    const itemResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        /\/api\/carts\/[^/]+\/items$/.test(response.url()),
    );
    await addButtons.nth(index).click();
    const response = await itemResponse;
    expect(response.ok()).toBeTruthy();
    cartId = new URL(response.url()).pathname.split("/").at(-2) ?? "";
    await expect(page.getByRole("status")).toContainText(
      "Позиция добавлена в корзину",
    );
  }
  expect(cartId).not.toBe("");
  await dialog.getByRole("button", { name: "Закрыть карточку" }).click();
  await page.getByRole("button", { name: /Корзина/ }).click();
  await expect(page.getByText("Цены и остатки актуальны.")).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(supplierCount + 1);
  return cartId;
}

async function assertCheckoutInPostgres(
  checkout: CheckoutPayload,
  supplierCount: number,
) {
  const persisted = await prisma.checkout.findUnique({
    where: { id: checkout.id },
    include: {
      cart: true,
      supplierOrders: {
        include: {
          items: {
            include: {
              reservation: { include: { inventoryBalance: true } },
            },
          },
        },
      },
    },
  });
  expect(persisted).not.toBeNull();
  expect(persisted?.status).toBe("COMPLETED");
  expect(persisted?.cart.status).toBe("CHECKED_OUT");
  expect(persisted?.idempotencyKey).toBe(`buyer-ui-${checkout.cartId}`);
  expect(persisted?.supplierOrders).toHaveLength(supplierCount);
  expect(
    new Set(
      persisted?.supplierOrders.map(
        ({ supplierOrganizationId }) => supplierOrganizationId,
      ),
    ).size,
  ).toBe(supplierCount);
  const persistedItems =
    persisted?.supplierOrders.flatMap(({ items }) => items) ?? [];
  expect(persistedItems).toHaveLength(supplierCount);
  for (const item of persistedItems) {
    expect(item.reservation?.status).toBe("ACTIVE");
    expect(
      Number(item.reservation?.inventoryBalance.quantityAvailable),
    ).toBeGreaterThanOrEqual(0);
  }
  expect(
    await prisma.checkout.count({
      where: {
        buyerOrganizationId: buyer.organizationId,
        idempotencyKey: `buyer-ui-${checkout.cartId}`,
      },
    }),
  ).toBe(1);
}

async function completeFlow(page: Page, supplierCount: number) {
  const errors = collectBrowserErrors(page);
  await openBuyer(page);
  const cartId = await addOffersToCart(page, supplierCount);
  const checkoutResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith(`/carts/${cartId}/checkout`),
  );
  await page.getByRole("button", { name: "Оформить заказ" }).click();
  const checkout = (await (await checkoutResponse).json()) as CheckoutPayload;
  expect(checkout.status).toBe("COMPLETED");
  expect(checkout.supplierOrders).toHaveLength(supplierCount);
  await expect(page.getByRole("heading", { name: "Заказы" })).toBeVisible();
  for (const order of checkout.supplierOrders) {
    await expect(
      page.getByText(order.orderNumber, { exact: true }),
    ).toBeVisible();
  }
  await expect(page.getByText("Ждёт подтверждения").first()).toBeVisible();

  const identityHeaders = {
    "x-user-id": buyer.userId,
    "x-organization-id": buyer.organizationId,
  };
  const repeated = await Promise.all([
    page.request.post(`${API_URL}/carts/${cartId}/checkout`, {
      headers: identityHeaders,
      data: { idempotencyKey: `buyer-ui-${cartId}` },
    }),
    page.request.post(`${API_URL}/carts/${cartId}/checkout`, {
      headers: identityHeaders,
      data: { idempotencyKey: `buyer-ui-${cartId}` },
    }),
  ]);
  const repeatedPayloads = await Promise.all(
    repeated.map((response) => responseJson<CheckoutPayload>(response)),
  );
  expect(repeatedPayloads.map(({ id }) => id)).toEqual([
    checkout.id,
    checkout.id,
  ]);
  await assertCheckoutInPostgres(checkout, supplierCount);
  expect(errors).toEqual([]);
}

test.describe.serial("@flow-a clinic purchase", () => {
  test.beforeAll(async () => {
    assertLocalDatabase();
    await prisma.$queryRaw`SELECT 1`;
    buyer = await createBuyerFixture();
    pilotProduct = await findComparablePilotProduct();
  });

  test.afterAll(async () => {
    try {
      await restoreInventoryAndDeleteFixture();
    } finally {
      await prisma.$disconnect();
    }
  });

  test("buyer creates and sees one supplier order", async ({ page }) => {
    await completeFlow(page, 1);
  });

  test("buyer creates split orders without duplicates", async ({ page }) => {
    await completeFlow(page, 2);
  });
});
