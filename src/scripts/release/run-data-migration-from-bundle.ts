import { spawn } from "node:child_process";
import { readAndDeleteBundle } from "../../shared/ephemeral-bundle";
import { DATA_MIGRATION_WORKFLOW_REF, assertProductionMutationAllowed } from "../production-execution-guard";
import { parseDataMigrationBundle } from "./data-migration-config";
import { assertLocalPortfolioImageProvenance } from "./image-provenance";

const IMAGE_PATTERN = /^us-east4-docker\.pkg\.dev\/personal-brand-501801\/portfolio\/portfolio@sha256:[0-9a-f]{64}$/;

async function main(): Promise<void> {
  assertProductionMutationAllowed(
    process.env,
    "Legacy Portfolio data migration",
    [DATA_MIGRATION_WORKFLOW_REF],
  );
  const bundlePath = process.argv[2];
  const imageDigestUri = process.argv[3];
  if (!bundlePath || !imageDigestUri || !IMAGE_PATTERN.test(imageDigestUri)) {
    throw new Error("A data-migration bundle and exact Portfolio image digest are required");
  }
  assertLocalPortfolioImageProvenance(imageDigestUri, process.env.GITHUB_SHA ?? "");
  const raw = await readAndDeleteBundle(bundlePath);
  const bundle = parseDataMigrationBundle(raw);
  const mode = process.env.PORTFOLIO_DATA_MIGRATION_MODE;
  if (mode !== "bootstrap" && mode !== "finalize") {
    throw new Error("PORTFOLIO_DATA_MIGRATION_MODE must be bootstrap or finalize");
  }
  if (mode === "finalize" && !process.env.PORTFOLIO_ADMIN_CUTOVER_EVIDENCE_JWS) {
    throw new Error("PORTFOLIO_ADMIN_CUTOVER_EVIDENCE_JWS is required for finalization");
  }
  const productionContextKeys = [
    "NODE_ENV",
    "GITHUB_ACTIONS",
    "GITHUB_REPOSITORY",
    "GITHUB_REF",
    "GITHUB_WORKFLOW_REF",
    "GITHUB_SHA",
    "GITHUB_WORKFLOW_SHA",
  ] as const;
  const bundleKeys = Object.keys(bundle) as Array<keyof typeof bundle>;
  const child = spawn(
    "docker",
    [
      "run",
      "--rm",
      "--pull=never",
      "--read-only",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges",
      "--pids-limit=128",
      "--memory=1g",
      "--cpus=2",
      "--tmpfs=/tmp:rw,noexec,nosuid,size=64m",
      ...bundleKeys.flatMap((key) => ["--env", key]),
      "--env",
      `PORTFOLIO_DATA_MIGRATION_MODE=${mode}`,
      "--env",
      "PORTFOLIO_RELEASE_IMAGE_DIGEST",
      "--env",
      "PORTFOLIO_IMAGE_RELEASE_RUN_ID",
      ...(mode === "finalize" ? ["--env", "PORTFOLIO_ADMIN_CUTOVER_EVIDENCE_JWS"] : []),
      ...productionContextKeys.flatMap((key) => process.env[key] === undefined ? [] : ["--env", key]),
      imageDigestUri,
      "dist/migrateLegacyData.cjs",
    ],
    {
      env: {
        ...process.env,
        ...bundle,
        PORTFOLIO_RELEASE_IMAGE_DIGEST: imageDigestUri,
        PORTFOLIO_IMAGE_RELEASE_RUN_ID: process.env.PORTFOLIO_IMAGE_RELEASE_RUN_ID,
      },
      stdio: "inherit",
      shell: false,
    },
  );
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) throw new Error(`Data-migration container exited with code ${exitCode}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Data-migration runner failed");
  process.exit(1);
});
