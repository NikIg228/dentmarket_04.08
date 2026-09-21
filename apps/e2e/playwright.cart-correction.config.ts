import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: 'cart-correction.spec.ts', workers: 1, fullyParallel: false,
  retries: 0, timeout: 90000, expect: { timeout: 10000 }, reporter: 'list',
  use: { ...devices['Desktop Chrome'], hasTouch: true, trace: 'off', screenshot: 'off', actionTimeout: 10000, navigationTimeout: 20000 },
});
