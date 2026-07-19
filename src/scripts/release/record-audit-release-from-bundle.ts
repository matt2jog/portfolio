import { Pool } from "pg";
import { readAndDeleteBundle } from "../../shared/ephemeral-bundle";
import { productionSupabaseConnectionConfig } from "../../shared/postgres-tls";
import { assertPortfolioMigratorDatabaseSession } from "../../shared/postgres-session";
import { assertProductionMutationAllowed } from "../production-execution-guard";
import { parseDeploymentBundle } from "./deployment-config";

async function main(): Promise<void> {
  assertProductionMutationAllowed(process.env, "Portfolio audit release registration");
  const [bundlePath, releaseSha, imageDigest] = process.argv.slice(2);
  if (!bundlePath || !/^[a-f0-9]{40}$/.test(releaseSha ?? "") || !/^sha256:[a-f0-9]{64}$/.test(imageDigest ?? "")) {
    throw new Error("Deployment bundle, release SHA, and image digest are required");
  }
  if (releaseSha !== process.env.GITHUB_SHA || releaseSha !== process.env.GITHUB_WORKFLOW_SHA) {
    throw new Error("Audit release registration must use the current workflow SHA");
  }
  const bundle = parseDeploymentBundle(await readAndDeleteBundle(bundlePath));
  const pool = new Pool({
    ...productionSupabaseConnectionConfig({
      databaseUrl: bundle.MIGRATION_DATABASE_URL,
      projectRef: bundle.SUPABASE_PROJECT_REF,
      supabaseCaCert: bundle.SUPABASE_CA_CERT,
      expectedCaSha256: bundle.SUPABASE_CA_SHA256,
      expectedRole: "portfolio_migrator_login",
      capabilityRole: "portfolio_migrator",
      searchPath: "portfolio, extensions",
    }),
    max: 1,
  });
  const client = await pool.connect();
  try {
    await assertPortfolioMigratorDatabaseSession(client);
    const result = await client.query<{ mode: string }>(
      `SELECT portfolio.record_database_audit_release($1, $2) AS mode`,
      [releaseSha, imageDigest],
    );
    const mode = result.rows[0]?.mode;
    if (mode !== "compatibility" && mode !== "enforced") {
      throw new Error("Portfolio audit release registration returned an invalid mode");
    }
    console.log(mode);
  } finally {
    client.release();
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Audit release registration failed");
  process.exit(1);
});
