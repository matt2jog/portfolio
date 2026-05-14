import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { viewportNames } from "../support/expected-screenshots";

export default async function globalSetup() {
  const root = path.resolve(process.cwd(), "src", "tests", "viewport-human-judge");

  for (const viewport of viewportNames) {
    const dir = path.join(root, viewport);
    await mkdir(dir, { recursive: true });

    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === ".gitkeep") continue;
      await rm(path.join(dir, entry.name), { recursive: true, force: true });
    }

    await writeFile(path.join(dir, ".gitkeep"), "", "utf8");
  }
}
