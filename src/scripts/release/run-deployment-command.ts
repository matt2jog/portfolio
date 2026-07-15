import { spawn } from "node:child_process";
import { parseDeploymentBundle } from "./deployment-config";
import { assertProductionMutationAllowed } from "../production-execution-guard";
import { readAndDeleteBundle } from "../../shared/ephemeral-bundle";

async function main(): Promise<void> {
  assertProductionMutationAllowed(process.env, "Cloud Run and edge deployment");
  const separator = process.argv.indexOf("--");
  const bundlePath = process.argv[2];
  const command = separator >= 0 ? process.argv[separator + 1] : undefined;
  const args = separator >= 0 ? process.argv.slice(separator + 2) : [];
  if (!bundlePath || !command) {
    throw new Error("A deployment bundle path and command after -- are required");
  }

  const bundle = parseDeploymentBundle(await readAndDeleteBundle(bundlePath));
  const childEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    CLOUDFLARE_API_TOKEN: bundle.CLOUDFLARE_API_TOKEN,
    EDGE_ORIGIN_TOKEN: bundle.EDGE_ORIGIN_TOKEN,
  };
  delete childEnvironment.DATABASE_URL;
  delete childEnvironment.MIGRATION_DATABASE_URL;
  delete childEnvironment.SUPABASE_CA_CERT;
  delete childEnvironment.SUPABASE_PROJECT_REF;
  if (bundle.EDGE_ORIGIN_PREVIOUS_TOKEN) {
    childEnvironment.EDGE_ORIGIN_PREVIOUS_TOKEN = bundle.EDGE_ORIGIN_PREVIOUS_TOKEN;
  } else {
    delete childEnvironment.EDGE_ORIGIN_PREVIOUS_TOKEN;
  }
  const child = spawn(command, args, {
    env: childEnvironment,
    stdio: "inherit",
    shell: false,
  });
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) throw new Error(`Deployment command exited with code ${exitCode}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Deployment command failed");
  process.exit(1);
});
