import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { writeFileSync } from "node:fs";

test.skip(process.env.E2E_RESUME_LIVE !== "true", "Requires explicit approved isolated audit DB and production landing build");
let child: ChildProcess;
let apiUrl: string;
let runId: string;
let counter = 0;
const requests = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
function fixture<T>(type: string, email: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = ++counter;
    const timer = setTimeout(() => { requests.delete(id); reject(new Error("Fixture IPC timeout")); }, 10_000);
    requests.set(id, { resolve: value => { clearTimeout(timer); resolve(value as T); }, reject: error => { clearTimeout(timer); reject(error); } });
    child.send({ id, type, email });
  });
}
test.beforeAll(async () => {
  const db = new URL(process.env.POSTGRES_TEST_DATABASE_URL ?? "http://invalid");
  expect(db.hostname).toBe("127.0.0.1"); expect(db.pathname).toBe("/dentmarket_audit_20260914");
  child = spawn(process.execPath, [path.resolve(process.cwd(), "../../scripts/verify-registration-resume.mjs"), "--serve"], { windowsHide: true, stdio: ["ignore", "ignore", "ignore", "ipc"] });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Isolated fixture startup timeout")), 60_000);
    child.once("exit", code => { clearTimeout(timer); reject(new Error(`Fixture exited ${code}`)); });
    child.on("message", (message: { type?: string; apiUrl?: string; runId?: string; id?: number; value?: unknown; error?: string }) => {
      if (message.type === "startup-error") { clearTimeout(timer); reject(new Error(message.error ?? "Fixture startup failed")); return; }
      if (message.type === "ready") { apiUrl = message.apiUrl!; runId = message.runId!; clearTimeout(timer); resolve(); return; }
      if (message.id) { const pending = requests.get(message.id); requests.delete(message.id); if (message.error) pending?.reject(new Error(message.error)); else pending?.resolve(message.value); }
    });
  });
});
test.afterAll(async () => {
  if (!child || child.exitCode !== null) return;
  await new Promise<void>(resolve => { const timer = setTimeout(resolve, 15_000); child.once("exit", () => { clearTimeout(timer); resolve(); }); if (child.connected) child.disconnect(); });
  if (child.exitCode === null) child.kill();
});

for (const [index, capability] of ["BUYER", "SUPPLIER"].entries()) {
  test(`real ${capability} interrupted intent, emailed proof, reload and sibling replay`, async ({ page, context, request }) => {
    const width = index === 0 ? 1440 : 390;
    await page.setViewportSize({ width, height: index === 0 ? 900 : 844 });
    const email = `${runId}-web-${index}@example.invalid`;
    const bin = `97${String(Date.now()).slice(-8)}0${index}`;
    const password = randomBytes(24).toString("base64url");
    const intent = await request.post(`${apiUrl}/onboarding/registrations`, { data: { email, bin, capability, ownerDisplayName: "Audit web owner", legalName: "Audit web company", organizationDisplayName: "Audit web company", termsAccepted: true, privacyAccepted: true, idempotencyKey: `${runId}-web-${index}` } });
    expect(intent.status()).toBe(201);
    if (capability === "SUPPLIER") expect((await request.post(`${apiUrl}/auth/register`, { data: { email, displayName: "Audit web owner", password } })).status()).toBe(201);
    await page.goto("http://127.0.0.1:3103/register");
    await page.getByRole("link", { name: "Уже начинали регистрацию? Продолжить незавершённую заявку" }).click();
    await page.screenshot({ path: test.info().outputPath(`${capability}-${width}-resume-request.png`) });
    await test.info().attach("request-field-labels", { body: JSON.stringify(await page.locator("label").allTextContents()), contentType: "application/json" });
    if (capability === "SUPPLIER") await page.getByRole("button", { name: /Поставщик/ }).tap();
    // Fluent required labels contain a visual asterisk; do not match raw label text exactly.
    await page.getByLabel("Email заявки").fill(email);
    await page.getByLabel("БИН организации").fill(bin);
    const submit = page.getByRole("button", { name: "Получить ссылку" });
    await submit.focus(); await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Принимаем запрос…" })).toBeDisabled();
    await expect(page.getByRole("status").filter({ hasText: "Запрос принят" })).toBeVisible();
    const link = await fixture<string>("mail", email); expect(Boolean(link)).toBe(true);
    await page.goto(link);
    const label = capability === "BUYER" ? "Пароль аккаунта" : "Текущий пароль";
    await expect(page.getByLabel(label)).toBeVisible();
    await page.reload(); await expect(page.getByLabel(label)).toHaveValue("");
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
    await page.screenshot({ path: test.info().outputPath(`${capability}-${width}-resume-ready.png`) });
    const sibling = await context.newPage(); await sibling.goto(link);
    await expect(sibling.getByLabel(label)).toBeVisible();
    await page.getByLabel(label).fill(password);
    if (capability === "BUYER") await page.getByLabel("Повторите пароль").fill(password);
    // Real server commit, artificially lost HTTP response. This is transport simulation,
    // not evidence of an actual backend outage. Refresh must recover the committed result.
    if (capability === "BUYER") await page.route("**/registration/resume/complete", async route => { await route.fetch(); await route.abort("failed"); });
    await page.getByRole("button", { name: "Завершить регистрацию", exact: true }).focus(); await page.keyboard.press("Enter");
    if (capability === "BUYER") {
      await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
      await expect(page.getByLabel(label)).toHaveValue(password);
      await expect(page.getByRole("heading", { name: "Регистрация завершена", exact: true })).toHaveCount(0);
      await page.reload();
    }
    await expect(page.getByRole("heading", { name: "Регистрация завершена", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Регистрация завершена", exact: true })).toBeFocused();
    await sibling.getByLabel(label).fill(password);
    if (capability === "BUYER") await sibling.getByLabel("Повторите пароль").fill(password);
    await sibling.getByRole("button", { name: "Завершить регистрацию", exact: true }).click();
    await expect(sibling.getByRole("heading", { name: "Регистрация завершена", exact: true })).toBeVisible();
    expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
    const result = await fixture<Record<string, unknown>>("readback", email);
    expect(result).toEqual({ intentCount: 1, userCount: 1, verified: true, status: "CLAIMED", organizationCount: 1, membershipCount: 1, auditCount: 1, outboxCount: 1 });
    writeFileSync(test.info().outputPath(`${capability}-database-readback.json`), JSON.stringify({ runId, ...result }, null, 2), { flag: "wx" });
    await page.screenshot({ path: test.info().outputPath(`${capability}-${width}-resume-completed.png`) });
    await test.info().attach(`${capability}-database-readback`, { body: JSON.stringify(result), contentType: "application/json" });
    await sibling.close();
  });
}

test("mobile validation and explicit synthetic network failure never claim completion", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:3103/register/resume");
  await page.getByRole("button", { name: "Получить ссылку" }).tap();
  await expect(page.getByText("Укажите email из исходной заявки.", { exact: true })).toBeVisible();
  await expect(page.getByText("Укажите БИН из 12 цифр.", { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("request-mobile-390-validation.png") });
  await page.getByLabel("Email заявки").fill("synthetic@example.invalid");
  await page.getByLabel("БИН организации").fill("123456789012");
  await page.route("**/registration/resume/request", route => route.abort("failed"));
  await page.getByRole("button", { name: "Получить ссылку" }).tap();
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Email заявки")).toHaveValue("synthetic@example.invalid");
  await expect(page.getByRole("button", { name: "Получить ссылку" })).toBeEnabled();
});

test("invalid link is a recoverable error without registration/account creation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`http://127.0.0.1:3103/register/resume#token=${"Z".repeat(64)}`);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("недействительна или истекла");
  await expect(page.getByRole("link", { name: "Запросить новую ссылку" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Завершить регистрацию", exact: true })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("resume-mobile-390-invalid-link.png") });
});

test("synthetic proof changes clear the form and ignore late inspect responses", async ({ page }) => {
  // UI lifecycle simulation only: no claim, mail, or DB outcome is inferred from these responses.
  const proofA = "A".repeat(64), proofB = "B".repeat(64), proofC = "C".repeat(64), proofDone = "D".repeat(64);
  let releaseSlow!: () => void;
  const slow = new Promise<void>(resolve => { releaseSlow = resolve; });
  let sawSlow!: () => void;
  const requestedSlow = new Promise<void>(resolve => { sawSlow = resolve; });
  let slowDelivered!: () => void;
  const delivered = new Promise<void>(resolve => { slowDelivered = resolve; });
  await page.route("**/registration/resume/inspect", async route => {
    const token = route.request().postDataJSON().token;
    if (token === proofB) { sawSlow(); await slow; }
    await route.fulfill({ json: { status: token === proofDone ? "COMPLETED" : "READY", email: "synthetic@example.invalid", bin: "123456789012", capability: "BUYER", organizationDisplayName: token === proofA ? "Synthetic A" : token === proofB ? "Synthetic B" : "Synthetic C", ownerDisplayName: "Synthetic owner", passwordMode: "NEW", expiresAt: "2099-01-01T00:00:00.000Z" } });
    if (token === proofB) slowDelivered();
  });
  await page.route("**/registration/resume/complete", route => route.fulfill({ status: 503, json: { message: "Тестовый отказ: повторите попытку" } }));
  await page.goto(`http://127.0.0.1:3103/register/resume#token=${proofA}`);
  await expect(page.getByText("Synthetic A", { exact: true })).toBeVisible();
  await page.getByLabel("Пароль аккаунта").fill("synthetic-password-only");
  await page.getByLabel("Повторите пароль").fill("synthetic-password-only");
  await page.getByRole("button", { name: "Завершить регистрацию", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await page.goto(`http://127.0.0.1:3103/register/resume#token=${proofB}`);
  await requestedSlow;
  await expect(page.getByText("Проверяем ссылку…", { exact: true })).toBeVisible();
  await expect(page.getByText("Synthetic A", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Пароль аккаунта")).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await page.goto(`http://127.0.0.1:3103/register/resume#token=${proofC}`);
  await expect(page.getByText("Synthetic C", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Пароль аккаунта")).toHaveValue("");
  await expect(page.getByLabel("Повторите пароль")).toHaveValue("");
  releaseSlow(); await delivered;
  await expect(page.getByText("Synthetic B", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Synthetic C", { exact: true })).toBeVisible();
  await page.goto("http://127.0.0.1:3103/register/resume#");
  await expect(page.getByLabel("Email заявки")).toHaveValue("");
  await expect(page.getByLabel("Пароль аккаунта")).toHaveCount(0);
  await page.goto(`http://127.0.0.1:3103/register/resume#token=${proofDone}`);
  await expect(page.getByRole("heading", { name: "Регистрация завершена", exact: true })).toBeFocused();
  await page.goto(`http://127.0.0.1:3103/register/resume#token=${proofC}`);
  await expect(page.getByLabel("Пароль аккаунта")).toHaveValue("");
  await expect(page.getByRole("heading", { name: "Регистрация завершена", exact: true })).toHaveCount(0);
});
