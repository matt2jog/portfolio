import path from 'node:path';
import { loadMigrationPlan } from '../migration-ledger';
import { sha256CanonicalJson } from './cutover-evidence';

export function migrationPlanDigest(migrationsFolder: string): string {
  const plan = loadMigrationPlan(migrationsFolder);
  return sha256CanonicalJson(plan.map(({ filename, journalTimestamp, checksum }) => ({
    filename,
    journalTimestamp,
    checksum,
  })));
}

if (process.argv[1]?.endsWith('migration-plan-digest.ts')) {
  console.log(migrationPlanDigest(path.resolve(process.argv[2] ?? 'migrations')));
}
