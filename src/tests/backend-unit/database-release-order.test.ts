import assert from 'node:assert/strict';
import test from 'node:test';
import { runDatabaseRelease, type DatabaseReleaseDependencies } from '../../scripts/release/run-database-release-from-bundle';
import type { PortfolioDeploymentBundle } from '../../scripts/release/deployment-config';

const bundle = {
  CLOUDFLARE_API_TOKEN: 'x'.repeat(32),
  EDGE_ORIGIN_TOKEN: 'x'.repeat(32),
  MIGRATION_DATABASE_URL: 'postgresql://unused',
  SOURCE_FENCE_DATABASE_URL: 'postgresql://unused',
  SUPABASE_CA_CERT: 'unused',
  SUPABASE_CA_SHA256: 'a'.repeat(64),
  SUPABASE_PROJECT_REF: 'qvbpgvazqfyhwjsfulsb',
} satisfies PortfolioDeploymentBundle;

test('ordinary database release has no administrator step', async () => {
  const order: string[] = [];
  const dependencies: DatabaseReleaseDependencies = {
    async runMigrationsFromBundle() { order.push('run-migrations-from-bundle'); },
    async verifyMigratorBoundary() { order.push('verify-migrator-boundary'); },
  };
  await runDatabaseRelease(
    bundle,
    `us-east4-docker.pkg.dev/personal-brand-501801/portfolio/portfolio@sha256:${'b'.repeat(64)}`,
    dependencies,
  );
  assert.deepEqual(order, [
    'run-migrations-from-bundle',
    'verify-migrator-boundary',
  ]);
});
