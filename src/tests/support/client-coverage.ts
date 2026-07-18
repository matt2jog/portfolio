import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "@playwright/test";

export function registerClientCoverage() {
  const coverageEnabled = process.env.CLIENT_COVERAGE === "1";

  test.afterEach(async ({ page }, testInfo) => {
    if (!coverageEnabled) return;

    let coverage: unknown;
    try {
      coverage = await page.evaluate(() => {
        return (
          globalThis as typeof globalThis & {
            __coverage__?: unknown;
          }
        ).__coverage__;
      });
    } catch (error) {
      if (testInfo.status !== testInfo.expectedStatus) return;
      throw error;
    }

    if (!coverage) {
      if (testInfo.status !== testInfo.expectedStatus) return;
      throw new Error(
        "Client coverage was requested, but Vite did not expose Istanbul coverage data.",
      );
    }

    const rawDirectory = path.resolve(process.cwd(), "coverage", "client", "raw");
    await mkdir(rawDirectory, { recursive: true });
    const fileName = [
      process.pid,
      testInfo.workerIndex,
      testInfo.retry,
      randomUUID(),
    ].join("-");
    await writeFile(
      path.join(rawDirectory, `${fileName}.json`),
      JSON.stringify(coverage),
      "utf8",
    );
  });
}
