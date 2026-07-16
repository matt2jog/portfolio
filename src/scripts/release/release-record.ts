import { sha256CanonicalJson } from './cutover-evidence';
import { readFile, writeFile } from 'node:fs/promises';

export interface PortfolioReleaseRecord {
  schemaVersion: 2;
  authorityPhase: 'private-irreversible';
  releaseSha: string;
  imageDigest: string;
  previousRevision: string;
  candidateRevision: string;
  previousRevisionPrivateCompatible: boolean;
  migrationLedgerDigest: string;
  cutoverEvidenceSha256: string;
  runtimeBundleVersion: string;
  deploymentBundleVersion: string;
  legalAuditBundleVersion: string;
  trafficGeneration: string;
  edgeVersion: string;
  pubsubConfigurationGeneration: string;
  cloudRunRollbackState: Record<string, unknown>;
  edgeRollbackState: Record<string, unknown>;
  cleanupEligibleAfter: string;
  cleanupRequiresLaterSuccessfulRelease: true;
  recordedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validatePortfolioReleaseRecord(record: PortfolioReleaseRecord): PortfolioReleaseRecord {
  if (record.schemaVersion !== 2 || record.authorityPhase !== 'private-irreversible') {
    throw new Error('release record has the wrong authority phase');
  }
  if (!/^[a-f0-9]{40}$/.test(record.releaseSha) || !/^sha256:[a-f0-9]{64}$/.test(record.imageDigest)) {
    throw new Error('release record identity is invalid');
  }
  if (!/^[a-f0-9]{64}$/.test(record.migrationLedgerDigest) || !/^[a-f0-9]{64}$/.test(record.cutoverEvidenceSha256)) {
    throw new Error('release record digest is invalid');
  }
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'string' && value.length === 0) throw new Error(`release record ${key} is empty`);
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(record.recordedAt)) {
    throw new Error('release record time is not canonical UTC');
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(record.cleanupEligibleAfter)) {
    throw new Error('release cleanup time is not canonical UTC');
  }
  if (Date.parse(record.cleanupEligibleAfter) - Date.parse(record.recordedAt) < 48 * 60 * 60_000) {
    throw new Error('release cleanup retention is shorter than 48 hours');
  }
  if (
    record.cloudRunRollbackState.schema_version !== 1
    || record.cloudRunRollbackState.release_sha !== record.releaseSha
    || !Array.isArray(record.cloudRunRollbackState.traffic_before)
    || !isRecord(record.cloudRunRollbackState.iam_before)
    || record.cloudRunRollbackState.candidate_revision !== record.candidateRevision
  ) {
    throw new Error('Cloud Run rollback state is incomplete or belongs to another release');
  }
  if (
    record.edgeRollbackState.schema_version !== 1
    || record.edgeRollbackState.worker !== 'portfolio-edge'
    || record.edgeRollbackState.candidate_version !== record.edgeVersion
    || !isRecord(record.edgeRollbackState.route_snapshot)
  ) {
    throw new Error('edge rollback state is incomplete or belongs to another release');
  }
  return record;
}

export function portfolioReleaseRecordDigest(record: PortfolioReleaseRecord): string {
  return sha256CanonicalJson(record);
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (!value) throw new Error(`Missing release-record environment variable: ${name}`);
  return value;
}

export function portfolioReleaseRecordFromEnvironment(
  environment: NodeJS.ProcessEnv,
  cloudRunRollbackState: Record<string, unknown>,
  edgeRollbackState: Record<string, unknown>,
  now = new Date(),
): PortfolioReleaseRecord {
  return validatePortfolioReleaseRecord({
    schemaVersion: 2,
    authorityPhase: required(environment, 'PORTFOLIO_AUTHORITY_PHASE') as 'private-irreversible',
    releaseSha: required(environment, 'GITHUB_SHA'),
    imageDigest: required(environment, 'IMAGE_DIGEST'),
    previousRevision: required(environment, 'PORTFOLIO_PREVIOUS_REVISION'),
    candidateRevision: required(environment, 'PORTFOLIO_CANDIDATE_REVISION'),
    previousRevisionPrivateCompatible:
      required(environment, 'PORTFOLIO_PREVIOUS_REVISION_COMPATIBILITY') === 'private-compatible',
    migrationLedgerDigest: required(environment, 'PORTFOLIO_MIGRATION_LEDGER_DIGEST'),
    cutoverEvidenceSha256: required(environment, 'PORTFOLIO_CUTOVER_EVIDENCE_SHA256'),
    runtimeBundleVersion: required(environment, 'RUNTIME_BUNDLE_VERSION'),
    deploymentBundleVersion: required(environment, 'DEPLOYMENT_BUNDLE_VERSION'),
    legalAuditBundleVersion: required(environment, 'LEGAL_AUDIT_BUNDLE_VERSION'),
    trafficGeneration: required(environment, 'PORTFOLIO_TRAFFIC_GENERATION'),
    edgeVersion: required(environment, 'PORTFOLIO_EDGE_VERSION'),
    pubsubConfigurationGeneration: required(environment, 'PORTFOLIO_PUBSUB_CONFIGURATION_GENERATION'),
    cloudRunRollbackState,
    edgeRollbackState,
    cleanupEligibleAfter: new Date(now.getTime() + 48 * 60 * 60_000).toISOString(),
    cleanupRequiresLaterSuccessfulRelease: true,
    recordedAt: now.toISOString(),
  });
}

async function readState(filename: string, label: string): Promise<Record<string, unknown>> {
  const value = JSON.parse(await readFile(filename, 'utf8')) as unknown;
  if (!isRecord(value)) throw new Error(`${label} rollback state is not an object`);
  return value;
}

async function main(): Promise<void> {
  const outputPath = process.argv[2];
  if (!outputPath) throw new Error('A release-record output path is required');
  const [cloudRunRollbackState, edgeRollbackState] = await Promise.all([
    readState(required(process.env, 'CLOUD_RUN_ROLLBACK_STATE_FILE'), 'Cloud Run'),
    readState(required(process.env, 'EDGE_ROLLBACK_STATE_FILE'), 'edge'),
  ]);
  const record = portfolioReleaseRecordFromEnvironment(
    process.env,
    cloudRunRollbackState,
    edgeRollbackState,
  );
  await writeFile(outputPath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  console.log(portfolioReleaseRecordDigest(record));
}

if (process.argv[1]?.endsWith('release-record.ts')) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Release-record creation failed');
    process.exit(1);
  });
}
