import { test, expect, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
test.skip(process.env.E2E_CART_CORRECTION_LIVE !== 'true', 'Explicit approved audit DB and production buyer artifact required');
let child: ChildProcess, counter = 0;
const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
function fixture<T = unknown>(type: string, index: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = ++counter, timer = setTimeout(() => { pending.delete(id); reject(Error('Cart fixture IPC timeout')); }, 15000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value as T); }, reject: error => { clearTimeout(timer); reject(error); } });
    child.send({ id, type, index });
  });
}
test.beforeAll(async () => {
  child = spawn(process.execPath, [path.resolve('../../scripts/verify-cart-correction.mjs')], { windowsHide: true, stdio: ['ignore','ignore','ignore','ipc'] });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Cart runtime startup timeout')), 75000);
    child.once('exit', code => { clearTimeout(timer); reject(Error(`Owned fixture exited ${code}`)); });
    child.on('message', (message: { type?: string; id?: number; value?: unknown; error?: string }) => {
      if (message.type === 'startup-diagnostics') { console.error(JSON.stringify(message.value)); return; }
      if (message.type === 'ready') { clearTimeout(timer); resolve(); return; }
      if (message.id) { const request = pending.get(message.id); pending.delete(message.id); if (message.error) request?.reject(Error(message.error)); else request?.resolve(message.value); }
    });
  });
});
test.afterAll(async () => {
  if (!child || child.exitCode !== null) return;
  await new Promise<void>(resolve => { const timer = setTimeout(resolve, 15000); child.once('exit', () => { clearTimeout(timer); resolve(); }); if (child.connected) child.disconnect(); });
  if (child.exitCode === null) child.kill();
});
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) await page.screenshot({ path: info.outputPath('failure.png') }).catch(() => undefined);
  await page.goto('about:blank');
});
type Case = { name: string; cartId: string; itemId: string; handoff: object };
type Readback = { version: number; status: string; items: { quantity: string; price: string; total: string }[]; edits: number; removals: number };
async function open(page: Page, index: number) {
  const entry = await fixture<Case>('create', index);
  // Genuine one-use handoff obtained via password login + actual local email proof.
  // No injected JWT/sessionStorage and no credential-bearing trace.
  await page.goto(`http://127.0.0.1:3101/#session=${encodeURIComponent(JSON.stringify(entry.handoff))}`);
  await expect(page).toHaveURL('http://127.0.0.1:3101/');
  if (!(await page.getByRole('button', { name: 'Корзина', exact: true }).isVisible())) await page.getByRole('button', { name: 'Открыть меню', exact: true }).click();
  await page.getByRole('button', { name: 'Корзина', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Корзина клиники' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: `Количество: ${entry.name}`, exact: true })).toHaveValue('4');
  const portalLayout = await page.locator('[data-portal-node].mp-provider').evaluateAll(nodes => nodes.map(node => ({ height: node.getBoundingClientRect().height, minHeight: getComputedStyle(node).minHeight })));
  expect(portalLayout.every(node => node.height === 0)).toBe(true);
  await test.info().attach('idle-portal-layout', { body: JSON.stringify(portalLayout), contentType: 'application/json' });
  return entry;
}
async function evidence(index: number, name: string) {
  const value = await fixture<Readback>('readback', index);
  await test.info().attach(name, { body: JSON.stringify(value, null, 2), contentType: 'application/json' }); return value;
}
test('desktop explicit correction preserves price diff and requires fresh acceptance', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const entry = await open(page, 1), quantity = page.getByRole('textbox', { name: `Количество: ${entry.name}`, exact: true });
  await fixture('price-stock', 1); await page.getByRole('button', { name: 'Обновить корзину', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Оформить заказ', exact: true })).toBeDisabled();
  await expect(quantity).toHaveValue('4');
  await quantity.fill('2');
  expect((await evidence(1, 'draft-not-persisted')).items[0].quantity).toBe('4');
  await page.getByRole('button', { name: 'Сохранить количество', exact: true }).click();
  await expect(page.getByText('Количество сохранено. Новые цены не принимаются автоматически.', { exact: true })).toBeVisible();
  const saved = await evidence(1, 'saved-before-acceptance');
  expect(saved.items).toEqual([{ quantity: '2', price: '100000', total: '200000' }]); expect(saved.edits).toBe(1);
  await expect(page.getByRole('button', { name: 'Оформить заказ', exact: true })).toBeDisabled();
  await expect(quantity).toBeFocused();
  await page.screenshot({ path: test.info().outputPath('buyer-cart-corrected-reprice-desktop-1440.png'), fullPage: true });
  await page.getByRole('button', { name: 'Принять изменения', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Оформить заказ', exact: true })).toBeEnabled();
  expect((await evidence(1, 'accepted-price')).items[0].price).toBe('150000');
  await page.reload(); await page.getByRole('button', { name: 'Корзина', exact: true }).click();
  await expect(quantity).toHaveValue('2');
  await expect(page.getByRole('button', { name: 'Оформить заказ', exact: true })).toBeEnabled();
  const checkoutResponse = page.waitForResponse(response => response.url().endsWith(`/carts/${entry.cartId}/checkout`) && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Оформить заказ', exact: true }).click();
  expect((await checkoutResponse).status()).toBe(201);
  await expect(page.getByText('Заказ оформлен и разделён по поставщикам', { exact: true })).toBeVisible();
  const order = await fixture('order-readback', 1);
  expect(order).toEqual([{ quantity: '2', price: '150000' }]);
  await test.info().attach('real-checkout-history', { body: JSON.stringify(order), contentType: 'application/json' });
});
test('mobile validation, keyboard help, unavailable removal and empty state', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const entry = await open(page, 2), quantity = page.getByRole('textbox', { name: `Количество: ${entry.name}`, exact: true });
  const help = page.getByRole('button', { name: `Помощь: количество ${entry.name}`, exact: true });
  await help.focus(); await page.keyboard.press('Enter');
  await expect(page.getByText('Сколько единиц продажи вы хотите заказать.', { exact: false })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(help).toBeFocused();
  await quantity.fill('0'); await expect(page.getByRole('button', { name: 'Сохранить количество', exact: true })).toBeDisabled();
  await expect(quantity).toHaveValue('0'); expect((await evidence(2, 'invalid-input-no-write')).items[0].quantity).toBe('4');
  await page.screenshot({ path: test.info().outputPath('buyer-cart-invalid-mobile-390.png'), fullPage: true });
  await page.getByRole('button', { name: 'Отменить ввод', exact: true }).click();
  await expect(quantity).toHaveValue('4'); await expect(quantity).toBeFocused();
  await fixture('unavailable', 2); await page.getByRole('button', { name: 'Обновить корзину', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Удалить позицию', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Удалить позицию', exact: true }).click();
  await page.getByRole('button', { name: 'Оставить', exact: true }).click(); expect((await evidence(2, 'cancel-delete')).items).toHaveLength(1);
  await page.getByRole('button', { name: 'Удалить позицию', exact: true }).click();
  await page.getByRole('button', { name: 'Да, удалить', exact: true }).click();
  await expect(page.getByText('Корзина пока пуста', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Обновить корзину', exact: true })).toBeFocused();
  const empty = await evidence(2, 'unavailable-last-line-removed'); expect(empty.items).toEqual([]); expect(empty.removals).toBe(1); expect(empty.status).toBe('ACTIVE');
  await page.screenshot({ path: test.info().outputPath('buyer-cart-empty-mobile-390.png') });
});
test('real concurrent edit retains draft; simulated lost response reconciles without duplicate write', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const entry = await open(page, 3), quantity = page.getByRole('textbox', { name: `Количество: ${entry.name}`, exact: true });
  await quantity.fill('2'); await fixture('concurrent-edit', 3);
  await page.getByRole('button', { name: 'Сохранить количество', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Корзина изменилась' })).toBeVisible(); await expect(quantity).toHaveValue('2');
  expect((await evidence(3, 'actual-409')).items[0].quantity).toBe('3');
  await page.screenshot({ path: test.info().outputPath('buyer-cart-concurrent-conflict-desktop-1440.png'), fullPage: true });
  await page.getByRole('button', { name: 'Обновить корзину', exact: true }).click();
  await expect(page.getByText('Сохранено: 3', { exact: true })).toBeVisible(); await expect(quantity).toHaveValue('2');
  await expect(page.getByRole('button', { name: 'Сохранить количество', exact: true })).toBeEnabled();
  // Deliberate transport simulation AFTER an actual API commit. Not a real backend outage.
  const routePattern = `**/carts/${entry.cartId}/items/${entry.itemId}`;
  await page.route(routePattern, async route => { const response = await route.fetch(); expect(response.status()).toBe(200); await route.abort('failed'); }, { times: 1 });
  await page.getByRole('button', { name: 'Сохранить количество', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Сервер не подтвердил изменение' })).toBeVisible(); await expect(quantity).toHaveValue('2');
  expect((await evidence(3, 'simulated-lost-response-real-commit')).edits).toBe(2);
  await page.getByRole('button', { name: 'Обновить корзину', exact: true }).click();
  await expect(page.getByText('Сохранено: 2', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Сохранить количество', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Сохранить количество', exact: true }).click();
  await expect(page.getByText('Количество сохранено. Новые цены не принимаются автоматически.', { exact: true })).toBeVisible();
  const final = await evidence(3, 'no-op-retry-no-duplicate-audit'); expect(final.items[0].quantity).toBe('2'); expect(final.edits).toBe(2);
  await expect(quantity).toHaveValue('2');
  await quantity.fill('5'); await fixture('concurrent-checkout', 3);
  await page.getByRole('button', { name: 'Сохранить количество', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Корзина изменилась' })).toBeVisible();
  await page.getByRole('button', { name: 'Обновить корзину', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Несохранённое количество: 5' })).toBeVisible();
  expect(await fixture('order-readback', 3)).toEqual([{ quantity: '2', price: '100000' }]);
});
