import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page, TestInfo } from "@playwright/test";

const outputRoot = path.resolve(process.cwd(), "src", "tests", "ui-artifacts");

function sanitizePathPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_/]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function saveViewportScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string,
) {
  const viewportName = testInfo.project.name;
  const safeName = sanitizePathPart(name);
  const filePath = path.join(outputRoot, viewportName, `${safeName}.png`);
  await mkdir(path.dirname(filePath), { recursive: true });
  await page.screenshot({ path: filePath, fullPage: false });
}

export async function savePaginatedScreenshots(
  page: Page,
  testInfo: TestInfo,
  name: string,
  options: {
    maxPages?: number;
    maxScrollDistance?: number;
    overlap?: number;
    settleMs?: number;
    startFromCurrentScroll?: boolean;
  } = {},
) {
  const {
    maxPages = 6,
    maxScrollDistance = 3_600,
    overlap = 180,
    settleMs = 300,
    startFromCurrentScroll = false,
  } = options;
  const viewportName = testInfo.project.name;
  const safeName = sanitizePathPart(name);
  const dirPath = path.join(outputRoot, viewportName, safeName);
  await mkdir(dirPath, { recursive: true });

  const viewportHeight = page.viewportSize()?.height ?? 900;
  const step = Math.max(1, viewportHeight - overlap);
  const captured: Array<{ file: string; scrollY: number }> = [];
  let scrollY = startFromCurrentScroll
    ? await page.evaluate(() => Math.max(0, window.scrollY))
    : 0;
  const startingScrollY = scrollY;

  for (let index = 0; index < maxPages; index += 1) {
    await page.evaluate((top) => window.scrollTo({ top, left: 0, behavior: "auto" }), scrollY);
    await page.waitForTimeout(settleMs);

    const file = `page-${String(index + 1).padStart(2, "0")}.png`;
    await page.screenshot({ path: path.join(dirPath, file), fullPage: false });
    captured.push({ file, scrollY });

    const metrics = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      scrollY: window.scrollY,
    }));
    const maxUsefulScroll = Math.min(
      Math.max(0, metrics.scrollHeight - metrics.viewportHeight),
      startingScrollY + maxScrollDistance,
    );
    const nextScrollY = Math.min(scrollY + step, maxUsefulScroll);

    if (nextScrollY <= scrollY || metrics.scrollY >= maxUsefulScroll) {
      break;
    }

    scrollY = nextScrollY;
  }

  await writeFile(
    path.join(dirPath, "manifest.json"),
    JSON.stringify(
      {
        name: safeName,
        viewport: viewportName,
        maxPages,
        maxScrollDistance,
        startingScrollY,
        captured,
      },
      null,
      2,
    ),
    "utf8",
  );
}
