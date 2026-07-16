import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import test from 'node:test';
import { Client } from 'pg';
import { applyPortfolioMigrations, loadMigrationPlan } from '../../scripts/migration-ledger';
import {
  runDatabaseRelease,
  type DatabaseReleaseDependencies,
} from '../../scripts/release/run-database-release-from-bundle';
import type { PortfolioDeploymentBundle } from '../../scripts/release/deployment-config';
import {
  assertPortfolioMigratorBootstrapSession,
  assertPortfolioMigratorDatabaseSession,
} from '../../shared/postgres-session';
import { postgresConnectionConfig } from '../../shared/postgres-tls';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required for database release integration tests');

function identifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

test('the production database wrapper executes the clean bootstrap contract in deploy order', async () => {
  const base = new URL(databaseUrl);
  const databaseName = `portfolio_release_${randomUUID().replaceAll('-', '')}`;
  const adminUrl = new URL(base);
  adminUrl.pathname = '/postgres';
  const databaseAdmin = new Client({ connectionString: adminUrl.toString() });
  const password = randomBytes(24).toString('base64url');
  const events: string[] = [];
  let targetAdmin: Client | undefined;
  try {
    await databaseAdmin.connect();
    await databaseAdmin.query(`CREATE DATABASE ${identifier(databaseName)}`);
    const targetUrl = new URL(base);
    targetUrl.pathname = `/${databaseName}`;
    targetAdmin = new Client({ connectionString: targetUrl.toString() });
    await targetAdmin.connect();
    await targetAdmin.query('CREATE SCHEMA extensions AUTHORIZATION postgres');
    await targetAdmin.query('CREATE EXTENSION vector WITH SCHEMA extensions');

    const dependencies: DatabaseReleaseDependencies = {
      async executeAdministratorSql(filename, sql) {
        events.push(filename);
        await targetAdmin!.query(sql);
        if (filename === 'portfolio-pre-migration.sql') {
          await targetAdmin!.query(`ALTER ROLE portfolio_migrator_login PASSWORD '${password}'`);
        }
      },
      async runMigrationsFromBundle() {
        events.push('digest-pinned-migrations');
        const loginUrl = new URL(targetUrl);
        loginUrl.username = 'portfolio_migrator_login';
        loginUrl.password = password;
        const migrator = new Client(postgresConnectionConfig(
          loginUrl.toString(), undefined, 'portfolio, extensions', undefined, 'portfolio_migrator',
        ));
        await migrator.connect();
        try {
          await assertPortfolioMigratorBootstrapSession(migrator);
          await applyPortfolioMigrations(
            migrator,
            loadMigrationPlan(path.resolve('src/migrations')),
            { allowSchemaBootstrap: false },
          );
        } finally {
          await migrator.end();
        }
      },
      async verifyMigratorBoundary() {
        events.push('post-acl-session-proof');
        const loginUrl = new URL(targetUrl);
        loginUrl.username = 'portfolio_migrator_login';
        loginUrl.password = password;
        const migrator = new Client(postgresConnectionConfig(
          loginUrl.toString(), undefined, 'portfolio, extensions', undefined, 'portfolio_migrator',
        ));
        await migrator.connect();
        try {
          await assertPortfolioMigratorDatabaseSession(migrator);
        } finally {
          await migrator.end();
        }
      },
    };
    await runDatabaseRelease(
      {} as PortfolioDeploymentBundle,
      `us-east4-docker.pkg.dev/personal-brand-501801/portfolio/portfolio@sha256:${'a'.repeat(64)}`,
      dependencies,
    );
    assert.deepEqual(events, [
      'portfolio-pre-migration.sql',
      'digest-pinned-migrations',
      'portfolio-role-acls.sql',
      'post-acl-session-proof',
    ]);
    assert.equal((await targetAdmin.query(
      `SELECT count(*)::int AS count FROM portfolio.schema_migrations`,
    )).rows[0]?.count, 17);
  } finally {
    await targetAdmin?.end().catch(() => undefined);
    if (databaseAdmin.connectionParameters.database) {
      await databaseAdmin.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
        [databaseName],
      ).catch(() => undefined);
      await databaseAdmin.query(`DROP DATABASE IF EXISTS ${identifier(databaseName)}`).catch(() => undefined);
    }
    await databaseAdmin.end().catch(() => undefined);
  }
});
