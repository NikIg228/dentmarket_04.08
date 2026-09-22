import { expect, test, type Page } from "@playwright/test";
import { installPilotWorkspace } from "../fixtures/workspace-session";
let disposeWorkspace: (() => Promise<void>) | undefined;
test.afterEach(async () => { await disposeWorkspace?.(); disposeWorkspace = undefined; });

const buyerUrl = process.env.E2E_BUYER_URL ?? "http://127.0.0.1:3001";
const supplierUrl = process.env.E2E_SUPPLIER_URL ?? "http://127.0.0.1:3002";

async function clickEmptyMargin(page: Page, width: number) {
  // The heading can be covered by a legitimate popup at 390px. Use the empty
  // page margin below the header, not a covered element or a forced click.
  if (width === 390) await page.touchscreen.tap(2, 700);
  else await page.mouse.click(2, 700);
}

// Browser-local fixtures only: these regressions never write organization data.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("dentmarket:search-history", JSON.stringify(["расходные материалы", "инструменты"]));
    localStorage.setItem("dentmarket:city", JSON.stringify({ id: null, name: "Алматы" }));
  });
});

for (const width of [1280, 390]) {
  test.describe(`dropdown dismissal at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, hasTouch: width === 390 });

    test("search starts closed and dismisses without losing input", async ({ page }) => {
      await page.goto(buyerUrl);
      const input = page.getByRole("combobox", { name: "Поиск по каталогу" });
      const list = page.getByRole("listbox", { name: "Подсказки поиска" });
      await expect(input).toHaveAttribute("aria-expanded", "false");
      await expect(list).toHaveCount(0);
      await expect(page.locator("datalist")).toHaveCount(0);

      await input.click();
      await expect(page.getByRole("option", { name: "расходные материалы", exact: true })).toBeVisible();
      await clickEmptyMargin(page, width);
      await expect(list).toHaveCount(0);

      await input.fill("пер");
      await expect(list).toBeVisible();
      await clickEmptyMargin(page, width);
      await expect(list).toHaveCount(0);
      await expect(input).toHaveValue("пер");

      await input.click();
      await expect(list).toBeVisible();
      await input.press("Escape");
      await expect(input).toBeFocused();
      await expect(input).toHaveValue("пер");
      await expect(input).toHaveAttribute("aria-expanded", "false");
      await expect(list).toHaveCount(0);

      await input.press("ArrowDown");
      await expect(list).toBeVisible();
      await input.press("Tab");
      await expect(list).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Найти", exact: true })).toBeFocused();
    });

    test("search selection and submit close even after history updates", async ({ page }) => {
      await page.goto(buyerUrl);
      const input = page.getByRole("combobox", { name: "Поиск по каталогу" });
      const list = page.getByRole("listbox", { name: "Подсказки поиска" });
      const submit = page.getByRole("button", { name: "Найти", exact: true });
      await input.click();
      const recent = page.getByRole("option", { name: "инструменты", exact: true });
      if (width === 390) await recent.tap();
      else await recent.click();
      await expect(input).toHaveValue("инструменты");
      await expect(list).toHaveCount(0);
      await expect(submit).toBeEnabled();

      await input.fill("пер");
      await input.press("ArrowDown");
      const selected = page.getByRole("option", { name: "перчатки", exact: true });
      await expect(selected).toHaveAttribute("aria-selected", "true");
      await expect(input).toBeFocused();
      await expect(input).toHaveAttribute("aria-activedescendant", (await selected.getAttribute("id"))!);
      await input.press("Enter");
      await expect(input).toHaveValue("перчатки");
      await expect(list).toHaveCount(0);
      await expect(submit).toBeEnabled();

      await input.fill("пер");
      await expect(list).toBeVisible();
      await submit.click();
      await expect(list).toHaveCount(0);
      await expect(submit).toBeEnabled();
      await expect(input).toHaveValue("пер");
      await expect(input).toHaveAttribute("aria-expanded", "false");
    });

    test("city dismisses outside, on Escape and selection without overlapping search", async ({ page }) => {
      await page.goto(buyerUrl);
      const trigger = page.getByLabel("Выберите город", { exact: true });
      const panel = page.getByRole("dialog", { name: "Выбор города" });
      const input = page.getByRole("combobox", { name: "Поиск по каталогу" });
      const list = page.getByRole("listbox", { name: "Подсказки поиска" });
      await input.click();
      await expect(list).toBeVisible();
      await trigger.click();
      await expect(list).toHaveCount(0);
      await expect(panel).toBeVisible();
      await panel.getByText("Выберите город, чтобы видеть актуальные условия доставки.").click();
      await expect(panel).toBeVisible();
      await clickEmptyMargin(page, width);
      await expect(panel).toBeHidden();

      await trigger.click();
      await expect(panel).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(panel).toBeHidden();
      await expect(trigger).toBeFocused();

      await trigger.click();
      await expect(panel).toBeVisible();
      if (width === 390) {
        // The city panel covers the second header row on mobile. Keyboard
        // navigation still dismisses it and can reach the search normally.
        await trigger.press("Shift+Tab");
        await page.keyboard.press("Shift+Tab");
      } else await input.click();
      await expect(panel).toBeHidden();
      await expect(list).toBeVisible();

      await trigger.click();
      await page.getByRole("combobox", { name: "Город доставки" }).selectOption("Астана");
      await expect(panel).toBeHidden();
      await expect(trigger).toContainText("Астана");
      await expect(trigger).toBeFocused();

      await trigger.click();
      await panel.getByRole("button", { name: "Не сейчас" }).focus();
      await page.keyboard.press("Tab");
      await expect(panel).toBeHidden();
      await expect(page.getByRole("link", { name: "Войти", exact: true })).toBeFocused();

      const sorting = page.getByRole("combobox", { name: "Сортировка каталога" });
      await sorting.selectOption("PRICE_ASC");
      await expect(sorting).toHaveValue("PRICE_ASC");
      await sorting.press("Escape");
      await expect(panel).toBeHidden();
      await expect(list).toHaveCount(0);
    });

    test("city handles Escape immediately after native opening, before toggle", async ({ page }) => {
      await page.goto(buyerUrl);
      const trigger = page.getByLabel("Выберите город", { exact: true });
      // First interaction establishes hydration. The regression is reopening
      // native details before its queued toggle can update React state.
      await trigger.click();
      await page.getByRole("button", { name: "Не сейчас" }).click();
      await expect(page.getByRole("dialog", { name: "Выбор города" })).toBeHidden();
      const result = await trigger.evaluate((summary) => {
        if (!(summary instanceof HTMLElement)) throw new Error("Expected an HTML summary trigger");
        const details = summary.parentElement as HTMLDetailsElement;
        let toggleDelivered = false;
        details.addEventListener("toggle", () => { toggleDelivered = true; }, { once: true });
        summary.focus();
        summary.click();
        const opened = details.open;
        summary.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        return { opened, toggleDelivered, closed: !details.open };
      });
      expect(result).toEqual({ opened: true, toggleDelivered: false, closed: true });
      await expect(trigger).toBeFocused();
    });

    test("supplier Fluent menu keeps outside and Escape dismissal", async ({ page }) => {
      const workspace = await installPilotWorkspace(page, "SUPPLIER"); disposeWorkspace = workspace.dispose;
      await page.goto(supplierUrl);
      await expect(page.getByRole("heading", { name: `Добрый день, ${workspace.displayName}` })).toBeVisible();
      const trigger = page.getByRole("button", { name: "Ещё", exact: true });
      if (width === 390) await trigger.tap();
      else await trigger.click();
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      await clickEmptyMargin(page, width);
      await expect(menu).toBeHidden();
      if (width === 390) await trigger.tap();
      else await trigger.click();
      await expect(menu).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await expect(trigger).toBeFocused();
    });
  });
}
