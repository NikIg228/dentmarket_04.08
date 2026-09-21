import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import path from "node:path";
const { generateTotp } = createRequire(path.resolve("package.json"))(path.resolve("../api/dist/src/platform/security/totp.js")) as { generateTotp(secret: string): string };
test.skip(process.env.E2E_LOCAL_AUTH_LIVE !== "true", "Explicit isolated DB and production landing/admin artifacts required");
type Account = { email: string; password: string; organizationId: string };
let child: ChildProcess, apiUrl: string, runId: string, counter = 0;
const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
function fixture<T>(type: string, input: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = ++counter, timer = setTimeout(() => { pending.delete(id); reject(new Error("Fixture IPC timeout")); }, 15000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value as T); }, reject: error => { clearTimeout(timer); reject(error); } });
    child.send({ id, type, ...input });
  });
}
test.beforeAll(async () => {
  child = spawn(process.execPath, [path.resolve("../../scripts/verify-local-auth.mjs"), "--serve"], { windowsHide: true, stdio: ["ignore","ignore","ignore","ipc"] });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Local-auth fixture startup timeout")), 75000);
    child.once("exit", code => { clearTimeout(timer); reject(new Error(`Owned fixture exited ${code}`)); });
    child.on("message", (message: { type?: string; apiUrl?: string; runId?: string; id?: number; value?: unknown; error?: string }) => {
      if (message.type === "startup-diagnostics") { console.error(JSON.stringify(message.value)); return; }
      if (message.type === "ready") { apiUrl = message.apiUrl!; runId = message.runId!; clearTimeout(timer); resolve(); return; }
      if (message.id) { const request = pending.get(message.id); pending.delete(message.id); if (message.error) request?.reject(new Error(message.error)); else request?.resolve(message.value); }
    });
  });
});
test.afterAll(async () => {
  if (!child || child.exitCode !== null) return;
  await new Promise<void>(resolve => { const timer = setTimeout(resolve, 15000); child.once("exit", () => { clearTimeout(timer); resolve(); }); if (child.connected) child.disconnect(); });
  if (child.exitCode === null) child.kill();
});
test.afterEach(async ({ page }, info) => {
  // Playwright also emits an automatic aria error-context even with tracing off.
  // Preserve a masked failure image, then clear the page before fixture teardown
  // so enrollment secrets/passwords cannot enter that automatic artifact.
  if (info.status !== info.expectedStatus && !page.isClosed()) {
    await page.screenshot({ path: info.outputPath("failure-masked.png"), mask: [page.getByRole("note", { name: "Данные для настройки MFA" }), page.locator("input")] }).catch(() => undefined);
  }
  if (!page.isClosed()) await page.goto("about:blank");
});

test("mobile registration acknowledges actual local file; reset uses delivered proof and revokes password", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const email = `${runId}-web@example.invalid`, password = randomBytes(24).toString("base64url");
  await page.goto("http://127.0.0.1:3103/register");
  await page.getByLabel("ФИО владельца").fill("Audit Local Owner");
  await page.getByLabel("Рабочий email").fill(email);
  await page.getByLabel("Пароль", { exact: false }).fill(password);
  await page.getByLabel("Юридическое наименование").fill("Audit Local Clinic");
  await page.getByLabel("Название в кабинете").fill("Audit Local Clinic");
  await page.getByLabel("БИН", { exact: true }).fill(`94${String(Date.now()).slice(-10)}`);
  const checkboxes = page.getByRole("checkbox"); await checkboxes.nth(0).check(); await checkboxes.nth(1).check();
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole("heading", { name: "Письмо сохранено локально" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("local-register-mobile-390.png") });
  const link = await fixture<string>("mail", { email, pathname: "/verify-email" }); expect(Boolean(link)).toBe(true);
  // Actual verification API, not UI handoff: buyer workspace is outside this auth fixture.
  const verified = await request.post(`${apiUrl}/auth/email/verify`, { data: { token: new URL(link).searchParams.get("token") } });
  expect(verified.status()).toBe(201);
  expect(await fixture("readback", { email })).toEqual({ userCount: 1, verified: true });
  await page.goto("http://127.0.0.1:3103/login"); await page.getByLabel("Рабочий email").fill(email);
  await page.getByRole("button", { name: "Забыли пароль?" }).click();
  await expect(page.getByRole("status").filter({ hasText: "локально" })).toBeVisible();
  const resetLink = await fixture<string>("mail", { email, pathname: "/reset-password" }); expect(Boolean(resetLink)).toBe(true);
  await page.goto(resetLink);
  const nextPassword = randomBytes(24).toString("base64url");
  // The surrounding region has the same accessible name; select the labelled input.
  await page.getByLabel("Новый пароль", { exact: false }).and(page.locator("input")).fill(nextPassword);
  await page.getByLabel("Повторите пароль").fill(nextPassword);
  await page.getByRole("button", { name: "Изменить пароль" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Пароль изменён" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("local-reset-completed-mobile-390.png") });
  expect((await request.post(`${apiUrl}/auth/login`, { data: { email, password } })).status()).toBe(401);
  expect((await request.post(`${apiUrl}/auth/login`, { data: { email, password: nextPassword } })).status()).toBe(201);
});

test("desktop operator password requires actual MFA, then mobile re-login uses challenge", async ({ page, context, request }) => {
  const operator = await fixture<Account>("account", { index: 11 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("http://127.0.0.1:3100/login");
  await expect(page.getByText("Локальный тестовый вход", { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("local-operator-login-desktop-1440.png") });
  await page.getByLabel("Email оператора").fill(operator.email); await page.getByLabel("Пароль оператора").fill(operator.password);
  await page.getByRole("button", { name: "Войти с паролем и MFA" }).focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Подключите двухфакторную проверку" })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("dentmarket_admin_session"))).toBeNull();
  const secretNote = page.getByRole("note", { name: "Данные для настройки MFA" });
  const secret = (await secretNote.locator("code").textContent())!;
  await page.screenshot({ path: test.info().outputPath("local-operator-mfa-desktop-1440.png"), mask: [secretNote] });
  await page.getByLabel("Код подтверждения").fill(generateTotp(secret));
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await page.waitForURL("http://127.0.0.1:3100/");
  const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem("dentmarket_admin_session") ?? "null"));
  expect(Boolean(stored?.accessToken)).toBe(true);
  expect(stored.activeOrganizationId).toBe(operator.organizationId);
  expect(stored.authenticationMethods).toContain("totp");
  expect((await request.get(`${apiUrl}/organizations`, { headers: { authorization: `Bearer ${stored.accessToken}` } })).status()).toBe(200);
  await test.info().attach("operator-readback", { body: JSON.stringify({ operatorOrganizationMatches: stored.activeOrganizationId === operator.organizationId, elevated: stored.authenticationMethods.includes("totp"), protectedApiStatus: 200 }), contentType: "application/json" });
  await page.evaluate(() => sessionStorage.clear()); await context.clearCookies();
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("http://127.0.0.1:3100/login");
  await page.getByLabel("Email оператора").fill(operator.email); await page.getByLabel("Пароль оператора").fill(operator.password);
  await page.getByRole("button", { name: "Войти с паролем и MFA" }).tap();
  await expect(page.getByRole("heading", { name: "Подтвердите вход" })).toBeVisible();
  await expect(page.getByRole("note")).toHaveCount(0);
  await page.getByLabel("Код подтверждения").fill("XXXX-XXXX-XXXX"); await page.getByRole("button", { name: "Продолжить", exact: true }).tap();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("dentmarket_admin_session"))).toBeNull();
  await page.getByLabel("Код подтверждения").fill("");
  await page.screenshot({ path: test.info().outputPath("local-operator-mfa-error-mobile-390.png") });
  await page.getByLabel("Код подтверждения").fill(generateTotp(secret)); await page.getByRole("button", { name: "Продолжить", exact: true }).tap();
  await page.waitForURL("http://127.0.0.1:3100/");
});

test("tenant cannot use operator login; unavailable capability hides local form", async ({ page }) => {
  const tenant = await fixture<Account>("account", { index: 12, capability: "BUYER" });
  await page.goto("http://127.0.0.1:3100/login");
  await page.getByLabel("Email оператора").fill(tenant.email); await page.getByLabel("Пароль оператора").fill(tenant.password);
  await page.getByRole("button", { name: "Войти с паролем и MFA" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Код подтверждения")).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem("dentmarket_admin_session"))).toBeNull();
  // Explicit UI-only unavailable-server simulation; API guards have independent tests.
  await page.route("**/auth/client-options", route => route.fulfill({ status: 503, body: "{}", contentType: "application/json" }));
  await page.reload(); await expect(page.getByLabel("Пароль оператора")).toHaveCount(0);
  await expect(page.getByText("Корпоративный вход пока недоступен", { exact: true })).toBeVisible();
});
