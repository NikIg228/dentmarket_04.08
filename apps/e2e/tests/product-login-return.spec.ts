import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomBytes, randomUUID } from "node:crypto";
import { readdir, readFile, unlink } from "node:fs/promises";
import path from "node:path";

// This regular CI scenario uses the isolated API started by playwright.config.
const buyerUrl = "http://127.0.0.1:3001";
const landingUrl = "http://127.0.0.1:3003";
const apiUrl = "http://127.0.0.1:4012/api";
const prefix = `e2e-product-return-${randomUUID()}`;
const mailDirectory = path.resolve(__dirname, "../../api/.tmp/auth-mail");
const mailFiles = new Set<string>();
const emails = new Set<string>();
const db = new PrismaClient();
let originalMail: Set<string>;
test.describe.configure({ timeout: 60_000 });

test.beforeAll(async ({ request }) => {
  const target = new URL(process.env.DATABASE_URL!);
  expect(["127.0.0.1", "localhost"]).toContain(target.hostname);
  const expectedDatabase = process.env.GITHUB_ACTIONS === "true" ? "marketplace" : "dentmarket_audit_20260914";
  expect(target.pathname).toBe(`/${expectedDatabase}`);
  const identity = await db.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
  expect(identity[0].name).toBe(expectedDatabase);
  const options = await request.get(`${apiUrl}/auth/client-options`);
  expect(options.ok()).toBe(true);
  expect((await options.json()).emailDelivery).toBe("LOCAL_FILE");
  originalMail = new Set(await readdir(mailDirectory).catch(() => []));
});

async function verificationLink(email: string) {
  expect(emails.has(email)).toBe(true);
  for (const name of await readdir(mailDirectory)) {
    if (originalMail.has(name) || !/^[a-f0-9-]{36}\.json$/.test(name)) continue;
    const payload = JSON.parse(await readFile(path.join(mailDirectory, name), "utf8"));
    if (payload.to !== email) continue;
    expect(payload.externalDelivery).toBe(false);
    expect(payload.delivery).toBe("LOCAL_FILE");
    mailFiles.add(name);
    const match = String(payload.text).match(/http:\/\/127\.0\.0\.1:3003\/verify-email\?[^\s]+/);
    expect(Boolean(match)).toBe(true);
    return match![0];
  }
  throw new Error("Expected the owned registration email in the local test transport");
}

test.afterAll(async () => {
  try {
    if (emails.size) {
      const users = await db.user.findMany({ where: { email: { in: [...emails] } }, select: { id: true } });
      await db.authSession.updateMany({ where: { userId: { in: users.map(user => user.id) }, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date(), revokeReason: "product_return_fixture_finished" } });
    }
    for (const name of mailFiles) {
      const payload = JSON.parse(await readFile(path.join(mailDirectory, name), "utf8"));
      expect(emails.has(payload.to)).toBe(true);
      await unlink(path.join(mailDirectory, name));
    }
  } finally { await db.$disconnect(); }
});

function observePurchases(page: Page, writes: string[]) {
  page.on("request", request => {
    const pathname = new URL(request.url()).pathname;
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method()) && /\/(?:carts|checkouts|orders)(?:\/|$)/.test(pathname)) writes.push(pathname);
  });
}

async function assertReturned(page: Page, product: URL, organizationId: string) {
  await page.waitForURL(url => url.origin === product.origin && url.pathname === product.pathname && url.hash === "");
  expect(new URL(page.url()).search).toBe(product.search);
  await page.getByRole("button", { name: "Сравнить и заказать", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "В корзину", exact: true }).and(page.locator("button:enabled")).first()).toBeEnabled();
  const session = await page.evaluate(() => {
    const value = JSON.parse(sessionStorage.getItem("dentmarket:buyer-session") ?? "null");
    return value ? { capability: value.capability, organizationId: value.organizationId } : null;
  });
  expect(session).toEqual({ capability: "BUYER", organizationId });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("link", { name: "← Вернуться в каталог", exact: true })).toHaveAttribute("href", product.searchParams.get("returnTo")!);
}

for (const width of [1280, 390]) {
  test(`product survives registration, email in new tab and password login at ${width}px`, async ({ page, context, browser }) => {
    await page.setViewportSize({ width, height: 900 });
    const email = `${prefix}-${width}@example.invalid`;
    const password = randomBytes(24).toString("base64url");
    const bin = `96${String(Date.now()).slice(-8)}${width === 1280 ? "01" : "02"}`;
    const writes: string[] = [];
    emails.add(email);
    observePurchases(page, writes);
    await page.goto(`${buyerUrl}/catalog?sort=PRICE_ASC&inStock=true&count=48`);
    await page.getByTestId("product-card").first().getByRole("link", { name: /Открыть карточку/ }).click();
    await page.waitForURL(url => url.pathname.startsWith("/products/"));
    await expect(page.getByRole("button", { name: "Сравнить и заказать", exact: true })).toBeVisible();
    const product = new URL(page.url());
    await page.getByRole("link", { name: "Войти", exact: true }).click();
    await page.waitForURL(url => url.origin === landingUrl && url.pathname === "/login");
    expect(new URL(page.url()).searchParams.get("returnTo")).toBe(product.pathname + product.search);
    await page.getByRole("link", { name: "Зарегистрироваться", exact: true }).click();
    await page.getByRole("button", { name: "Продолжить", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Проверьте отмеченные поля" })).toBeVisible();
    expect(await db.user.count({ where: { email } })).toBe(0);
    await page.getByLabel("ФИО владельца").fill("Тестовый владелец");
    await page.getByLabel("Рабочий email").fill(email);
    await page.getByLabel("Пароль", { exact: false }).fill(password);
    await page.getByLabel("Юридическое наименование").fill("Тестовая клиника возврата");
    await page.getByLabel("Название в кабинете").fill("Клиника возврата");
    await page.getByRole("textbox", { name: "БИН", exact: true }).fill(bin);
    await page.getByRole("checkbox", { name: "Принимаю условия использования" }).check();
    await page.getByRole("checkbox", { name: "Согласен с политикой конфиденциальности" }).check();
    await page.getByRole("button", { name: "Продолжить", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Письмо сохранено локально" })).toBeVisible();
    const link = await verificationLink(email);
    expect(new URL(link).searchParams.get("returnTo")).toBe(product.pathname + product.search);
    const verified = await context.newPage();
    observePurchases(verified, writes);
    await verified.goto(link);
    await verified.waitForURL(url => url.origin === buyerUrl && url.pathname === product.pathname && url.hash === "");
    const registration = await db.registrationIntent.findFirstOrThrow({ where: { email, status: "CLAIMED" }, select: { organizationId: true } });
    await assertReturned(verified, product, registration.organizationId!);
    await verified.getByRole("link", { name: "← Вернуться в каталог", exact: true }).click();
    await expect(verified).toHaveURL(buyerUrl + product.searchParams.get("returnTo"));
    await verified.close();

    const loginContext = await browser.newContext({ viewport: { width, height: 900 } });
    try {
      const login = await loginContext.newPage();
      observePurchases(login, writes);
      await login.goto(product.href);
      await login.getByRole("button", { name: "Сравнить и заказать", exact: true }).click();
      await login.getByRole("dialog").getByRole("button", { name: "В корзину", exact: true }).and(login.locator("button:enabled")).first().click();
      await login.waitForURL(url => url.origin === landingUrl && url.pathname === "/login");
      await login.getByLabel("Рабочий email").fill(email);
      await login.getByLabel("Пароль", { exact: false }).fill("wrong-password");
      await login.getByRole("button", { name: "Войти по email", exact: true }).click();
      await expect(login.getByRole("alert")).toBeVisible();
      expect(new URL(login.url()).searchParams.get("returnTo")).toBe(product.pathname + product.search);
      await expect(login.getByLabel("Рабочий email")).toHaveValue(email);
      await login.getByLabel("Пароль", { exact: false }).fill(password);
      await login.getByRole("button", { name: "Войти по email", exact: true }).click();
      await assertReturned(login, product, registration.organizationId!);
      await login.reload();
      await assertReturned(login, product, registration.organizationId!);
      expect(writes).toEqual([]);
      expect(await db.cart.count({ where: { buyerOrganizationId: registration.organizationId! } })).toBe(0);
    } finally { await loginContext.close(); }
  });
}
