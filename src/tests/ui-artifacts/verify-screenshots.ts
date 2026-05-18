import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  expectedPaginatedScreenshotItems,
  expectedScreenshotItems,
  viewportNames,
} from "../support/expected-screenshots";

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

  for (const item of expectedPaginatedScreenshotItems) {
    const dirPath = path.join(root, viewport, item);
    try {
      const manifestPath = path.join(dirPath, "manifest.json");
      const manifest = await stat(manifestPath);
      const entries = await readdir(dirPath);
      const pages = entries.filter((entry) => /^page-\d+\.png$/.test(entry));

      if (!manifest.isFile() || manifest.size === 0 || pages.length === 0) {
        missing.push(`${viewport}/${item}/manifest.json and paginated PNGs`);
      }

      for (const page of pages) {
        const file = await stat(path.join(dirPath, page));
        if (!file.isFile() || file.size === 0) {
          missing.push(`${viewport}/${item}/${page}`);
        }
      }
    } catch {
      missing.push(`${viewport}/${item}/manifest.json and paginated PNGs`);
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

console.log(
  `Verified ${
    (expectedScreenshotItems.length + expectedPaginatedScreenshotItems.length) *
    viewportNames.length
  } viewport artifact groups.`,
);
