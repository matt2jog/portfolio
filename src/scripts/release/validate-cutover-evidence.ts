import { readFile } from 'node:fs/promises';
import { parseFinalCutoverEvidence } from './cutover-evidence';

async function main(): Promise<void> {
  const [filename, imageDigest, imageReleaseRunId, evidenceSha256, migrationLedgerDigest] = process.argv.slice(2);
  if (!filename || !imageDigest || !imageReleaseRunId || !evidenceSha256) {
    throw new Error('Evidence file, image digest, image release run, and evidence SHA-256 are required');
  }
  const evidence = parseFinalCutoverEvidence(await readFile(filename, 'utf8'), {
    expectedProjectRef: 'qvbpgvazqfyhwjsfulsb',
    expectedImageDigest: imageDigest,
    expectedImageReleaseRunId: imageReleaseRunId,
    expectedEvidenceSha256: evidenceSha256,
    expectedMigrationLedgerDigest: migrationLedgerDigest || undefined,
    maximumAgeMs: 24 * 60 * 60_000,
  });
  if (evidence.tables.length !== 23) throw new Error('Cutover evidence must cover exactly 23 bridge tables');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Cutover evidence validation failed');
  process.exit(1);
});
