import { stat } from "node:fs/promises";
import path from "node:path";
import { expectedScreenshotItems, viewportNames } from "../support/expected-screenshots";

const root = path.resolve(process.cwd(), "src", "tests", "ui-artifacts");
const missing: string[] = [];

for (const viewport of viewportNames) {
  for (const item of expectedScreenshotItems) {
    const filePath = path.join(root, viewport, `${item}.png`);
    try {
      const file = await stat(filePath);
      if (!file.isFile() || file.size === 0) {
        missing.push(`${viewport}/${item}.png`);
      }
    } catch {
      missing.push(`${viewport}/${item}.png`);
    }
  }
}

if (missing.length > 0) {
  console.error("Missing or empty viewport screenshots:");
  for (const item of missing) {
    console.error(`- ${item}`);
  }
  process.exit(1);
}

console.log(`Verified ${expectedScreenshotItems.length * viewportNames.length} viewport screenshots.`);
