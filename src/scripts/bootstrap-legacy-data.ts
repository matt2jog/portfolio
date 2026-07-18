import { randomBytes } from "node:crypto";
import path from "node:path";
import { Client, Pool, type PoolClient } from "pg";
import {
  postgresConnectionConfig,
  productionSupabaseConnectionConfig,
} from "../shared/postgres-tls";
import {
  bootstrapLegacyPortfolioData,
  PORTFOLIO_DATA_TABLES,
} from "./legacy-data-migration";
import {
  parseFinalCutoverEvidence,
  sha256CanonicalJson,
  type FinalCutoverEvidence,
} from "./release/cutover-evidence";
import { migrationPlanDigest } from "./release/migration-plan-digest";
import {
  verifyAdminCutoverEvidenceJws,
  type AdminCutoverGateEvidence,
} from "./release/admin-cutover-evidence";
import {
  assertProductionMutationAllowed,
  DATA_MIGRATION_WORKFLOW_REF,
} from "./production-execution-guard";
import {
  assertPortfolioLegacyReaderDatabaseSession,
  assertPortfolioMigratorDatabaseSession,
} from "../shared/postgres-session";
import {
  abortSourceWriteFence,
  activateSourceWriteFence,
} from "./release/source-write-fence";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function main(): Promise<void> {
  assertProductionMutationAllowed(
    process.env,
    "Legacy Portfolio data migration",
    [DATA_MIGRATION_WORKFLOW_REF],
  );
  const mode = required("PORTFOLIO_DATA_MIGRATION_MODE");
  if (mode !== "bootstrap" && mode !== "finalize") {
    throw new Error("PORTFOLIO_DATA_MIGRATION_MODE must be bootstrap or finalize");
  }
  const releaseImageDigest = required("PORTFOLIO_RELEASE_IMAGE_DIGEST").replace(/^.*@/, "");
  const releaseMigrationLedgerDigest = migrationPlanDigest(path.resolve(process.cwd(), "migrations"));
  let adminEvidence: AdminCutoverGateEvidence | undefined;
  if (mode === "finalize") {
    adminEvidence = await verifyAdminCutoverEvidenceJws(
      required("PORTFOLIO_ADMIN_CUTOVER_EVIDENCE_JWS"),
      {
        releaseSha: required("GITHUB_SHA"),
        imageDigest: releaseImageDigest,
        imageReleaseRunId: required("PORTFOLIO_IMAGE_RELEASE_RUN_ID"),
        migrationLedgerDigest: releaseMigrationLedgerDigest,
      },
    );
  }

  const sourceUrl = required("LEGACY_PORTFOLIO_DATABASE_URL");
  const sourceCa = process.env.LEGACY_PORTFOLIO_SUPABASE_CA_CERT;
  const targetUrl = required("TARGET_PORTFOLIO_DATABASE_URL");
  const targetCa = process.env.TARGET_PORTFOLIO_SUPABASE_CA_CERT;
  const production = process.env.NODE_ENV === "production";
  const sourceProjectRef = production
    ? required("LEGACY_PORTFOLIO_SUPABASE_PROJECT_REF")
    : undefined;
  const targetProjectRef = production
    ? required("TARGET_PORTFOLIO_SUPABASE_PROJECT_REF")
    : undefined;
  if (production && sourceProjectRef !== targetProjectRef) {
    throw new Error("Legacy Portfolio source and target must use one shared Supabase project with separate roles and schemas");
  }
  if (production && sourceCa !== targetCa) {
    throw new Error("Legacy Portfolio source and target must use the same pinned Supabase certificate");
  }
  const sourcePool = new Pool({
    ...(production
      ? productionSupabaseConnectionConfig({
        databaseUrl: sourceUrl,
        projectRef: sourceProjectRef ?? "",
        supabaseCaCert: sourceCa,
        expectedCaSha256: process.env.LEGACY_PORTFOLIO_SUPABASE_CA_SHA256,
        expectedRole: "portfolio_legacy_reader_login",
        capabilityRole: "portfolio_legacy_reader",
        searchPath: "public",
      })
      : postgresConnectionConfig(sourceUrl, sourceCa, "public")),
    max: 1,
  });
  const targetPool = new Pool({
    ...(production
      ? productionSupabaseConnectionConfig({
        databaseUrl: targetUrl,
        projectRef: targetProjectRef ?? "",
        supabaseCaCert: targetCa,
        expectedCaSha256: process.env.TARGET_PORTFOLIO_SUPABASE_CA_SHA256,
        expectedRole: "portfolio_migrator_login",
        capabilityRole: "portfolio_migrator",
        searchPath: "portfolio, extensions",
      })
      : postgresConnectionConfig(targetUrl, targetCa, "portfolio, extensions")),
    max: 1,
  });

  const fenceClient = mode === "finalize" ? new Client(productionSupabaseConnectionConfig({
    databaseUrl: required("SOURCE_FENCE_DATABASE_URL"),
    projectRef: targetProjectRef ?? "",
    supabaseCaCert: targetCa,
    expectedCaSha256: process.env.TARGET_PORTFOLIO_SUPABASE_CA_SHA256,
    expectedRole: "portfolio_fence_login",
    capabilityRole: "portfolio_fence_operator",
    searchPath: "portfolio, extensions",
  })) : undefined;
  const installFinalWriteFence = async (): Promise<FinalCutoverEvidence["writeFence"]> => {
    if (!production || mode !== "finalize") throw new Error("Final write fence is production-finalize only");
    if (!fenceClient) throw new Error("Portfolio source-fence client is unavailable");
    await fenceClient.connect();
    await fenceClient.query("SET ROLE portfolio_fence_operator");
    return activateSourceWriteFence(fenceClient, randomBytes(32).toString("hex"), 1800);
  };

  let source: PoolClient | undefined;
  let target: PoolClient | undefined;
  let writeFence: FinalCutoverEvidence["writeFence"] | undefined;
  let finalizationCompleted = false;
  try {
    writeFence = mode === "finalize" ? await installFinalWriteFence() : undefined;
    source = await sourcePool.connect();
    target = await targetPool.connect();
    if (production) {
      await assertPortfolioLegacyReaderDatabaseSession(source, PORTFOLIO_DATA_TABLES);
      await assertPortfolioMigratorDatabaseSession(target);
    }
    const evidence = await bootstrapLegacyPortfolioData(source, target, mode === "finalize"
      ? { requireEmptyTarget: false, eventSilent: true }
      : undefined);
    if (mode === "bootstrap") {
      console.log(JSON.stringify({
        status: "staged",
        cutoverReady: false,
        sourceRetained: true,
        eventSilent: true,
        tables: evidence,
      }));
    } else {
      if (!adminEvidence) throw new Error("Verified Admin cutover evidence is required for finalization");
      const finalEvidence: FinalCutoverEvidence = {
        schemaVersion: 1,
        status: "finalized",
        cutoverReady: true,
        sourceRetained: true,
        eventSilent: true,
        projectRef: "qvbpgvazqfyhwjsfulsb",
        imageDigest: releaseImageDigest,
        imageReleaseRunId: required("PORTFOLIO_IMAGE_RELEASE_RUN_ID"),
        migrationLedgerDigest: releaseMigrationLedgerDigest,
        writeFence: writeFence!,
        adminSnapshot: adminEvidence.adminSnapshot,
        careerCheckpoint: adminEvidence.careerCheckpoint,
        tables: evidence.map(({ table, ownership, rowCount, sha256, sourceRetained }) => ({
          table,
          ownership,
          rowCount,
          sha256,
          sourceRetained,
        })),
      };
      parseFinalCutoverEvidence(finalEvidence, {
        expectedProjectRef: finalEvidence.projectRef,
        expectedImageDigest: finalEvidence.imageDigest,
        expectedEvidenceSha256: sha256CanonicalJson(finalEvidence),
        expectedMigrationLedgerDigest: finalEvidence.migrationLedgerDigest,
        maximumAgeMs: 60 * 60_000,
      });
      console.log(JSON.stringify(finalEvidence));
      finalizationCompleted = true;
    }
  } finally {
    if (writeFence && !finalizationCompleted && fenceClient) {
      await abortSourceWriteFence(fenceClient, writeFence.fenceId).catch(() => undefined);
    }
    source?.release();
    target?.release();
    await Promise.all([
      sourcePool.end(),
      targetPool.end(),
      fenceClient?.end().catch(() => undefined),
    ]);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Legacy Portfolio data migration failed");
  process.exit(1);
});
