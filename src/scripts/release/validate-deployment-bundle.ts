import { parseDeploymentBundle } from "./deployment-config";
import { readAndDeleteBundle } from "../../shared/ephemeral-bundle";

async function main(): Promise<void> {
  const bundlePath = process.argv[2];
  if (!bundlePath) throw new Error("Deployment bundle path is required");
  parseDeploymentBundle(await readAndDeleteBundle(bundlePath));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Deployment bundle validation failed");
  process.exit(1);
});
