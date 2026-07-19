import { Client } from "pg";
import { productionSupabaseConnectionConfig } from "../../shared/postgres-tls";
import { assertProductionMutationAllowed, DEPLOY_WORKFLOW_REF } from "../production-execution-guard";
import { abortSourceWriteFence, commitSourceWriteFence } from "./source-write-fence";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required source-fence configuration: ${name}`);
  return value;
}

async function main(): Promise<void> {
  assertProductionMutationAllowed(process.env, "Portfolio source-fence transition", [DEPLOY_WORKFLOW_REF]);
  const [command, token] = process.argv.slice(2);
  if ((command !== "abort" && command !== "commit") || !token) {
    throw new Error("Portfolio source-fence command must be abort or commit with an exact token");
  }
  const client = new Client(productionSupabaseConnectionConfig({
    databaseUrl: required("SOURCE_FENCE_DATABASE_URL"),
    projectRef: required("SUPABASE_PROJECT_REF"),
    supabaseCaCert: required("SUPABASE_CA_CERT"),
    expectedCaSha256: required("SUPABASE_CA_SHA256"),
    expectedRole: "portfolio_fence_login",
    capabilityRole: "portfolio_fence_operator",
    searchPath: "portfolio, extensions",
  }));
  await client.connect();
  try {
    await client.query("SET ROLE portfolio_fence_operator");
    if (command === "abort") await abortSourceWriteFence(client, token);
    else await commitSourceWriteFence(client, token);
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Portfolio source-fence transition failed");
  process.exit(1);
});
