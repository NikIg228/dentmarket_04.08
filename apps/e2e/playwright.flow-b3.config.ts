import { defineConfig, devices } from "@playwright/test";

const workspace = "../..";
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://marketplace:marketplace@127.0.0.1:5432/marketplace?schema=public";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";

export default defineConfig({
  testDir: "./tests",
  testMatch: "flow-b3*.spec.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "npm run start --workspace=@marketplace/api",
      cwd: workspace,
      url: "http://127.0.0.1:4012/api/health",
      env: {
        DATABASE_URL: databaseUrl,
        API_HOST: "127.0.0.1",
        API_PORT: "4012",
        AUTH_MODE: "development",
        DEPLOYMENT_PROFILE: "pilot",
        PROCESS_ROLE: "all",
        BACKGROUND_QUEUE_ENABLED: "false",
        OBJECT_STORAGE_DRIVER: "local",
        AV_SCAN_MODE: "disabled",
      },
      reuseExistingServer: true,
      timeout: 120_000,
    },
    { command: "npm exec --workspace=@marketplace/admin-web -- next start --port 3010", cwd: workspace, url: "http://127.0.0.1:3010", reuseExistingServer: true, timeout: 60_000 },
    { command: "npm run start --workspace=@marketplace/buyer-web", cwd: workspace, url: "http://127.0.0.1:3001", env: { NEXT_PUBLIC_API_URL: API_URL }, reuseExistingServer: true, timeout: 60_000 },
  ],
});
