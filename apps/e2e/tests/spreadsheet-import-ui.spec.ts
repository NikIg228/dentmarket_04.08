import { expect, test } from "@playwright/test";

const organizationId = "00000000-0000-4000-8000-000000000020";
for (const width of [1440, 390]) test(`UI-only spreadsheet preview, retry and processing at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(organizationId => {
    sessionStorage.setItem("dentmarket:supplier-session", JSON.stringify({ sessionId: "ui-import", accessToken: "synthetic", accessTokenExpiresAt: Date.now() + 900000, organizationId, capability: "SUPPLIER" }));
  }, organizationId);
  let processed = 0;
  let uploads = 0;
  let failUpload = true;
  const source = { id: "00000000-0000-4000-8000-000000000030", name: "Основной прайс", type: "CSV", status: "ACTIVE" };
  const batch = { id: "00000000-0000-4000-8000-000000000040", fileName: "price.csv", status: "MAPPED", totalRows: 1, source, createdAt: "2026-09-25T00:00:00.000Z", updatedAt: "2026-09-25T00:00:00.000Z", rows: [{ id: "row", rowNumber: 4, status: "RAW", rawData: { externalId: "A-001", name: "Материал для проверки", priceMinor: "9007199254740993" }, errorMessage: null }] };
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.endsWith("/auth/workspace-context")) return route.fulfill({ json: { organizationId, organizationDisplayName: "Тестовый поставщик", capabilities: ["SUPPLIER"] } });
    if (path.endsWith("/organizations/current/onboarding")) return route.fulfill({ json: { organization: { organizationId, canEdit: false }, capability: "SUPPLIER", ready: true, steps: [{ id: "organization", complete: true, label: "Анкета заполнена" }] } });
    if (path.endsWith("/integrations/onboarding/readiness")) return route.fulfill({ json: { channel: "CSV", completedSteps: 1, totalSteps: 1, progressPercent: 100, connection: null, timeTargets: {}, steps: [] } });
    if (path.endsWith("/data-sources")) return route.fulfill({ json: [source] });
    if (path.endsWith("/import-batches") && method === "POST") {
      uploads++;
      expect(route.request().postDataJSON()).toMatchObject({ sourceId: source.id, fileType: "CSV", columnMapping: { externalId: "externalId", name: "name" } });
      if (failUpload) return route.fulfill({ status: 503, json: { message: "Загрузка временно недоступна" } });
      return route.fulfill({ json: batch });
    }
    if (path.endsWith(`/import-batches/${batch.id}/process`)) {
      processed++; batch.status = "COMPLETED"; batch.rows[0]!.status = "MATCHED";
      return route.fulfill({ json: batch });
    }
    if (path.endsWith(`/import-batches/${batch.id}/diagnostics`)) return route.fulfill({ json: { processedRows: 1, errorRows: 0, byStatus: { MATCHED: 1 } } });
    if (path.endsWith(`/import-batches/${batch.id}`)) return route.fulfill({ json: batch });
    return route.fulfill({ json: [] });
  });
  await page.goto("http://127.0.0.1:3002");
  if (width === 390) await page.getByRole("button", { name: "Открыть меню", exact: true }).click();
  await page.getByRole("button", { name: "Загрузка товаров", exact: true }).click();
  const panel = page.locator("section").filter({ has: page.getByRole("heading", { name: "Импорт Excel / CSV", exact: true }) });
  await panel.getByLabel("Таблица поставщика", { exact: true }).setInputFiles({ name: "price.csv", mimeType: "text/csv", buffer: Buffer.from("externalId,name,priceMinor\nA-001,Материал для проверки,9007199254740993\n") });
  await panel.getByLabel("Источник прайса", { exact: true }).selectOption(source.id);
  await panel.getByRole("button", { name: "Загрузить для просмотра" }).click();
  await expect(panel.getByRole("alert")).toBeVisible();
  expect(processed).toBe(0);
  await expect(panel.getByLabel("Колонка: Название товара", { exact: true })).toHaveValue("name");
  failUpload = false;
  await panel.getByRole("button", { name: "Загрузить для просмотра" }).focus();
  await page.keyboard.press("Enter");
  await expect(panel.getByRole("table")).toContainText("9007199254740993");
  expect(uploads).toBe(2); expect(processed).toBe(0);
  await panel.screenshot({ path: test.info().outputPath(`spreadsheet-preview-${width}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await panel.getByRole("button", { name: "Данные проверены — обработать" }).click();
  await expect(panel.getByText("Обработано: 1.", { exact: false })).toBeVisible();
  expect(processed).toBe(1);
  await expect(panel.getByRole("button", { name: "Данные проверены — обработать" })).toHaveCount(0);
});
