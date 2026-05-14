import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5000";

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts/,
  globalSetup: "./global-setup.ts",
  timeout: 180_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL,
    browserName: "chromium",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      },
    },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev:client -- --host 127.0.0.1",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
