import { spawn } from 'node:child_process';
import { Client } from 'pg';
import { readAndDeleteBundle } from '../../shared/ephemeral-bundle';
import { productionSupabaseConnectionConfig } from '../../shared/postgres-tls';
import { assertPortfolioMigratorDatabaseSession } from '../../shared/postgres-session';
import { assertProductionMutationAllowed } from '../production-execution-guard';
import { parseDeploymentBundle, type PortfolioDeploymentBundle } from './deployment-config';
import { assertLocalPortfolioImageProvenance } from './image-provenance';

const IMAGE_PATTERN = /^us-east4-docker\.pkg\.dev\/personal-brand-501801\/portfolio\/portfolio@sha256:[a-f0-9]{64}$/;
export interface DatabaseReleaseDependencies {
  runMigrationsFromBundle(bundle: PortfolioDeploymentBundle, imageDigestUri: string): Promise<void>;
  verifyMigratorBoundary(bundle: PortfolioDeploymentBundle): Promise<void>;
}

async function spawnMigrationContainer(
  bundle: PortfolioDeploymentBundle,
  imageDigestUri: string,
): Promise<void> {
  const productionContextKeys = [
    'NODE_ENV', 'GITHUB_ACTIONS', 'GITHUB_REPOSITORY', 'GITHUB_REF', 'GITHUB_WORKFLOW_REF',
    'GITHUB_SHA', 'GITHUB_WORKFLOW_SHA',
  ] as const;
  const child = spawn('docker', [
    'run', '--rm', '--pull=never', '--read-only', '--cap-drop=ALL',
    '--security-opt=no-new-privileges', '--pids-limit=128', '--memory=1g', '--cpus=2',
    '--tmpfs=/tmp:rw,noexec,nosuid,size=64m',
    '--env', 'DATABASE_URL', '--env', 'SUPABASE_CA_CERT', '--env', 'SUPABASE_CA_SHA256',
    '--env', 'SUPABASE_PROJECT_REF',
    ...productionContextKeys.flatMap((key) => process.env[key] === undefined ? [] : ['--env', key]),
    imageDigestUri,
    'dist/migrate.cjs',
  ], {
    env: {
      ...process.env,
      DATABASE_URL: bundle.MIGRATION_DATABASE_URL,
      SUPABASE_CA_CERT: bundle.SUPABASE_CA_CERT,
      SUPABASE_CA_SHA256: bundle.SUPABASE_CA_SHA256,
      SUPABASE_PROJECT_REF: bundle.SUPABASE_PROJECT_REF,
    },
    stdio: 'inherit',
    shell: false,
  });
  const code = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (value) => resolve(value ?? 1));
  });
  if (code !== 0) throw new Error(`Migration container exited with code ${code}`);
}

function connectionConfig(bundle: PortfolioDeploymentBundle, databaseUrl: string, expectedRole: string, capabilityRole?: string) {
  return productionSupabaseConnectionConfig({
    databaseUrl,
    projectRef: bundle.SUPABASE_PROJECT_REF,
    supabaseCaCert: bundle.SUPABASE_CA_CERT,
    expectedCaSha256: bundle.SUPABASE_CA_SHA256,
    expectedRole,
    capabilityRole,
    searchPath: 'portfolio, extensions',
  });
}

function productionDependencies(bundle: PortfolioDeploymentBundle): DatabaseReleaseDependencies {
  return {
    runMigrationsFromBundle: spawnMigrationContainer,
    async verifyMigratorBoundary(bundle) {
      const client = new Client(connectionConfig(
        bundle,
        bundle.MIGRATION_DATABASE_URL,
        'portfolio_migrator_login',
        'portfolio_migrator',
      ));
      await client.connect();
      try {
        await assertPortfolioMigratorDatabaseSession(client);
      } finally {
        await client.end();
      }
    },
  };
}

export async function runDatabaseRelease(
  bundle: PortfolioDeploymentBundle,
  imageDigestUri: string,
  dependencies?: DatabaseReleaseDependencies,
): Promise<void> {
  if (!IMAGE_PATTERN.test(imageDigestUri)) throw new Error('An exact Portfolio image digest is required');
  const actions = dependencies ?? productionDependencies(bundle);
  // Role/schema bootstrap and admin ACL reconciliation are deliberately absent
  // from ordinary releases; only the one-time database-bootstrap boundary owns them.
  await actions.runMigrationsFromBundle(bundle, imageDigestUri);
  await actions.verifyMigratorBoundary(bundle);
}

async function main(): Promise<void> {
  assertProductionMutationAllowed(process.env, 'Portfolio database release');
  const bundlePath = process.argv[2];
  const imageDigestUri = process.argv[3];
  if (!bundlePath || !imageDigestUri) throw new Error('A deployment bundle path and image digest are required');
  assertLocalPortfolioImageProvenance(imageDigestUri, process.env.GITHUB_SHA ?? '');
  const bundle = parseDeploymentBundle(await readAndDeleteBundle(bundlePath));
  await runDatabaseRelease(bundle, imageDigestUri);
}

if (process.argv[1]?.endsWith('run-database-release-from-bundle.ts')) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Portfolio database release failed');
    process.exit(1);
  });
}
