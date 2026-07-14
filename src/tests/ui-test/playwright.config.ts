import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5000";
const slowMo = Number.parseInt(process.env.PLAYWRIGHT_SLOW_MO_MS ?? "0", 10);
const requestedWorkers = Number.parseInt(process.env.PLAYWRIGHT_WORKERS ?? "2", 10);

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts/,
  timeout: 60_000,
  fullyParallel: true,
  workers: Number.isFinite(requestedWorkers) ? Math.max(1, requestedWorkers) : 2,
  reporter: [["list"]],
  use: {
    baseURL,
    browserName: "chromium",
    viewport: { width: 1280, height: 800 },
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    launchOptions: { slowMo: Number.isFinite(slowMo) ? Math.max(0, slowMo) : 0 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev:client -- --host 127.0.0.1",
        cwd: "../../..",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
