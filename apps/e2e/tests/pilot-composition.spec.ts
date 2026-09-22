import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { installPilotWorkspace } from "../fixtures/workspace-session";
let disposeWorkspace: (() => Promise<void>) | undefined;
test.afterEach(async () => { await disposeWorkspace?.(); disposeWorkspace = undefined; });

const root = resolve(process.cwd(), "../..");
const output = resolve(root, "output/playwright/pilot-composition");
const optionalPath =
  /\/(?:api\/)?(?:ai|trust|promotions|billing|recommendations)(?:\/|$)/;

function observe(page: Page) {
  const optionalRequests: string[] = [];
  const failedApi: string[] = [];
  page.on("request", (request) => {
    if (optionalPath.test(new URL(request.url()).pathname))
      optionalRequests.push(request.url());
  });
  page.on("response", (response) => {
    if (
      new URL(response.url()).pathname.startsWith("/api/") &&
      response.status() >= 400
    )
      failedApi.push(
        `${response.status()} ${new URL(response.url()).pathname}`,
      );
  });
  return { optionalRequests, failedApi };
}

async function finish(
  page: Page,
  evidence: ReturnType<typeof observe>,
  name: string,
) {
  await page.waitForLoadState("networkidle");
  expect(evidence.optionalRequests).toEqual([]);
  expect(evidence.failedApi).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  mkdirSync(output, { recursive: true });
  await page.screenshot({
    path: resolve(output, `${name}.png`),
    fullPage: false,
  });
}

test.beforeAll(async ({ request }) => {
  for (const app of ["buyer", "supplier", "admin", "landing"]) {
    const artifact = JSON.parse(
      readFileSync(
        resolve(root, `apps/${app}-web/.next/required-server-files.json`),
        "utf8",
      ),
    );
    expect(
      artifact.config.env.NEXT_PUBLIC_DEPLOYMENT_PROFILE,
      `${app} must be rebuilt for pilot`,
    ).toBe("pilot");
  }
  // Reject a reused go_live API even if the local web build artifacts are pilot.
  const response = await request.get("http://127.0.0.1:4012/docs-json");
  expect(response.ok()).toBe(true);
  const paths = Object.keys((await response.json()).paths);
  expect(paths.filter((path) => optionalPath.test(path))).toEqual([]);
  expect(paths).toContain("/api/marketplace/search");
});

for (const width of [1280, 390]) {
  test(`pilot buyer menu and live comparison omit optional features at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const evidence = observe(page);
    const workspace = await installPilotWorkspace(page, "BUYER"); disposeWorkspace = workspace.dispose;
    await page.goto("http://127.0.0.1:3001");
    await expect(
      page.getByRole("heading", {
        name: "Закупки для стоматологии без лишних звонков",
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Сервисы", exact: true }).click();
    await expect(
      page.getByRole("menuitem", { name: "Поддержка", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: /AI-помощник|Рекомендации/ }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    const card = page.getByTestId("product-card").first();
    await expect(card).toBeVisible();
    const comparison = page.waitForResponse((response) =>
      /\/marketplace\/products\/[^/]+\/compare/.test(response.url()),
    );
    await card.getByRole("button", { name: /Смотреть/ }).click();
    expect((await comparison).ok()).toBe(true);
    await expect(
      page.getByRole("heading", { name: "Выберите продавца" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Отзывы клиник" }),
    ).toHaveCount(0);
    await expect(page.getByText("Нет истории", { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "В корзину", exact: true }).first(),
    ).toBeVisible();
    await finish(page, evidence, `buyer-${width}`);
  });

  test(`pilot supplier retains compliance without promotion and trust menus at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const evidence = observe(page);
    const workspace = await installPilotWorkspace(page, "SUPPLIER"); disposeWorkspace = workspace.dispose;
    await page.goto("http://127.0.0.1:3002");
    await expect(
      page.getByRole("heading", { name: `Добрый день, ${workspace.displayName}` }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Ещё", exact: true }).click();
    await expect(
      page.getByRole("menuitem", { name: /Акции|Доверие/ }),
    ).toHaveCount(0);
    await page
      .getByRole("menuitem", { name: "Комплаенс", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Комплаенс и документы организации" }),
    ).toBeVisible();
    await finish(page, evidence, `supplier-${width}`);
  });

  test(`pilot admin keeps audit without mounting trust operations at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const evidence = observe(page);
    await page.goto("http://127.0.0.1:3010");
    const drawer = page.getByRole("button", {
      name: "Открыть меню",
      exact: true,
    });
    if (await drawer.isVisible()) await drawer.click();
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Контроль и аудит", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Журнал оператора", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Контроль и аудит", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Проверки поставщиков, рейтинг и ограничения."),
    ).toHaveCount(0);
    await expect(page.locator("#trust-operations-title")).toHaveCount(0);
    await finish(page, evidence, `admin-${width}`);
  });
}
