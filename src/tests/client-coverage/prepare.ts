import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = path.resolve(process.cwd());
const coverageRoot = path.resolve(repositoryRoot, "coverage", "client");
const repositoryPrefix = `${repositoryRoot}${path.sep}`;

if (!coverageRoot.startsWith(repositoryPrefix)) {
  throw new Error(`Refusing to remove coverage outside ${repositoryRoot}`);
}

await rm(coverageRoot, { recursive: true, force: true });
await mkdir(path.join(coverageRoot, "raw"), { recursive: true });
