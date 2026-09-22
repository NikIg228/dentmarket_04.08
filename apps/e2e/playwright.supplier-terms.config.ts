import { defineConfig, devices } from "@playwright/test";
export default defineConfig({ testDir: "./tests", testMatch: "supplier-terms.spec.ts", workers: 1, fullyParallel: false, retries: 0, timeout: 120_000, expect: { timeout: 10_000 }, reporter: "list", use: { ...devices["Desktop Chrome"], trace: "retain-on-failure", screenshot: "only-on-failure", actionTimeout: 10_000 } });
