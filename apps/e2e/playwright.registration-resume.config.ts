import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests", testMatch: "registration-resume.spec.ts",
  workers: 1, fullyParallel: false, retries: 0, timeout: 90_000,
  expect: { timeout: 10_000 }, reporter: "list",
  // An explicit isolated fixture owns API/mail/landing. No main dev server reuse.
  use: { ...devices["Desktop Chrome"], hasTouch: true, trace: "off", screenshot: "off", actionTimeout: 10_000, navigationTimeout: 20_000 },
});
