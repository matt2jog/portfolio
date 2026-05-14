import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Page, TestInfo } from "@playwright/test";

const outputRoot = path.resolve(process.cwd(), "src", "tests", "viewport-human-judge");

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
