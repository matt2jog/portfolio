import { readFile } from "node:fs/promises";
import { parseDeploymentBundle } from "./deployment-config";

async function main(): Promise<void> {
  const bundlePath = process.argv[2];
  if (!bundlePath) throw new Error("Deployment bundle path is required");
  parseDeploymentBundle(await readFile(bundlePath, "utf8"));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Deployment bundle validation failed");
  process.exit(1);
});
