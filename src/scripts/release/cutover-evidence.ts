import { createHash } from 'node:crypto';
import { PORTFOLIO_BRIDGE_MANIFEST } from '../legacy-data-migration';

export const PORTFOLIO_SUPABASE_PROJECT_REF = 'qvbpgvazqfyhwjsfulsb';
export const PORTFOLIO_BRIDGE_MANIFEST_SHA256 = sha256CanonicalJson(
  PORTFOLIO_BRIDGE_MANIFEST.map(({ table, ownership }) => ({ table, ownership })),
);

export interface FinalCutoverTableEvidence {
  table: string;
  ownership: 'owned' | 'projection' | 'hybrid';
  rowCount: number;
  sha256: string;
  sourceRetained: true;
}

export interface FinalCutoverEvidence {
  schemaVersion: 1;
  status: 'finalized';
  cutoverReady: true;
  sourceRetained: true;
  eventSilent: true;
  projectRef: typeof PORTFOLIO_SUPABASE_PROJECT_REF;
  imageDigest: string;
  imageReleaseRunId: string;
  migrationLedgerDigest: string;
  writeFence: {
    fenceId: string;
    active: true;
    verifiedAt: string;
    expiresAt: string;
    triggerDigest: string;
  };
  adminSnapshot: {
    snapshotId: string;
    snapshotDigest: string;
    producerRelease: string;
    capturedAt: string;
    resumeCutoverComplete: true;
  };
  careerCheckpoint: {
    generation: string;
    aggregateCount: number;
    checkpointDigest: string;
    gapCount: 0;
  };
  tables: FinalCutoverTableEvidence[];
}

const SHA256 = /^[a-f0-9]{64}$/;
const IMAGE_DIGEST = /^sha256:[a-f0-9]{64}$/;
const RELEASE_SHA = /^[a-f0-9]{40}$/;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requireExactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} keys are not exact`);
  }
}

function requireString(value: unknown, label: string, pattern?: RegExp): string {
  if (typeof value !== 'string' || value.length === 0 || (pattern && !pattern.test(value))) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function requireCount(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${label} is invalid`);
  return value as number;
}

function requireUtc(value: unknown, label: string): string {
  const text = requireString(value, label, UTC_TIMESTAMP);
  if (Number.isNaN(Date.parse(text))) throw new Error(`${label} is invalid`);
  return text;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

export function sha256CanonicalJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value)), 'utf8').digest('hex');
}

export function parseFinalCutoverEvidence(
  raw: string | unknown,
  expected: {
    expectedProjectRef: string;
    expectedImageDigest: string;
    expectedImageReleaseRunId?: string;
    expectedEvidenceSha256: string;
    expectedMigrationLedgerDigest?: string;
    now?: Date;
    maximumAgeMs?: number;
  },
): FinalCutoverEvidence {
  const value = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw;
  const root = requireRecord(value, 'cutover evidence');
  requireExactKeys(root, [
    'schemaVersion', 'status', 'cutoverReady', 'sourceRetained', 'eventSilent', 'projectRef',
    'imageDigest', 'imageReleaseRunId', 'migrationLedgerDigest', 'writeFence', 'adminSnapshot', 'careerCheckpoint', 'tables',
  ], 'cutover evidence');
  if (
    root.schemaVersion !== 1 || root.status !== 'finalized' || root.cutoverReady !== true ||
    root.sourceRetained !== true || root.eventSilent !== true
  ) {
    throw new Error('cutover evidence is not finalized, ready, retained, and event-silent');
  }
  if (root.projectRef !== PORTFOLIO_SUPABASE_PROJECT_REF || root.projectRef !== expected.expectedProjectRef) {
    throw new Error(`cutover evidence project must equal ${PORTFOLIO_SUPABASE_PROJECT_REF}`);
  }
  const imageDigest = requireString(root.imageDigest, 'imageDigest', IMAGE_DIGEST);
  if (imageDigest !== expected.expectedImageDigest) throw new Error('cutover evidence image digest mismatch');
  const imageReleaseRunId = requireString(root.imageReleaseRunId, 'image release run id', /^[1-9][0-9]*$/);
  if (expected.expectedImageReleaseRunId && imageReleaseRunId !== expected.expectedImageReleaseRunId) {
    throw new Error('cutover evidence image release run mismatch');
  }
  const migrationLedgerDigest = requireString(root.migrationLedgerDigest, 'migrationLedgerDigest', SHA256);
  if (expected.expectedMigrationLedgerDigest && migrationLedgerDigest !== expected.expectedMigrationLedgerDigest) {
    throw new Error('cutover evidence migration ledger digest mismatch');
  }

  const fence = requireRecord(root.writeFence, 'write fence');
  requireExactKeys(fence, ['fenceId', 'active', 'verifiedAt', 'expiresAt', 'triggerDigest'], 'write fence');
  if (fence.active !== true) throw new Error('cutover write fence is not active');
  const verifiedAt = requireUtc(fence.verifiedAt, 'write fence verification time');
  const expiresAt = requireUtc(fence.expiresAt, 'write fence expiry time');
  if (Date.parse(expiresAt) <= Date.parse(verifiedAt)) throw new Error('cutover write fence lease is expired');
  const writeFence = {
    fenceId: requireString(fence.fenceId, 'write fence id'),
    active: true as const,
    verifiedAt,
    expiresAt,
    triggerDigest: requireString(fence.triggerDigest, 'write fence trigger digest', SHA256),
  };

  const snapshot = requireRecord(root.adminSnapshot, 'Admin snapshot');
  requireExactKeys(snapshot, ['snapshotId', 'snapshotDigest', 'producerRelease', 'capturedAt', 'resumeCutoverComplete'], 'Admin snapshot');
  if (snapshot.resumeCutoverComplete !== true) throw new Error('Admin snapshot does not prove Resume cutover');
  const capturedAt = requireUtc(snapshot.capturedAt, 'Admin snapshot capture time');
  const adminSnapshot = {
    snapshotId: requireString(snapshot.snapshotId, 'Admin snapshot id'),
    snapshotDigest: requireString(snapshot.snapshotDigest, 'Admin snapshot digest', SHA256),
    producerRelease: requireString(snapshot.producerRelease, 'Admin snapshot producer release', RELEASE_SHA),
    capturedAt,
    resumeCutoverComplete: true as const,
  };

  const checkpoint = requireRecord(root.careerCheckpoint, 'career checkpoint');
  requireExactKeys(checkpoint, ['generation', 'aggregateCount', 'checkpointDigest', 'gapCount'], 'career checkpoint');
  if (checkpoint.gapCount !== 0) throw new Error('career checkpoint has an event gap');
  const careerCheckpoint = {
    generation: requireString(checkpoint.generation, 'career checkpoint generation'),
    aggregateCount: requireCount(checkpoint.aggregateCount, 'career checkpoint aggregate count'),
    checkpointDigest: requireString(checkpoint.checkpointDigest, 'career checkpoint digest', SHA256),
    gapCount: 0 as const,
  };

  if (!Array.isArray(root.tables) || root.tables.length !== PORTFOLIO_BRIDGE_MANIFEST.length) {
    throw new Error(`cutover table evidence must match the exact ${PORTFOLIO_BRIDGE_MANIFEST.length}-table ownership manifest`);
  }
  const names = new Set<string>();
  let totalRows = 0;
  const tables = root.tables.map((item, index): FinalCutoverTableEvidence => {
    const table = requireRecord(item, `table evidence ${index}`);
    requireExactKeys(table, ['table', 'ownership', 'rowCount', 'sha256', 'sourceRetained'], `table evidence ${index}`);
    const name = requireString(table.table, `table evidence ${index} name`);
    if (names.has(name)) throw new Error(`duplicate table evidence for ${name}`);
    names.add(name);
    if (table.ownership !== 'owned' && table.ownership !== 'projection' && table.ownership !== 'hybrid') {
      throw new Error(`table evidence ${name} ownership is invalid`);
    }
    const manifest = PORTFOLIO_BRIDGE_MANIFEST[index];
    if (name !== manifest.table || table.ownership !== manifest.ownership) {
      throw new Error(`table evidence ${index} does not match the exact Portfolio ownership manifest`);
    }
    if (table.sourceRetained !== true) throw new Error(`table evidence ${name} did not retain its source`);
    const rowCount = requireCount(table.rowCount, `table evidence ${name} row count`);
    totalRows += rowCount;
    return {
      table: name,
      ownership: table.ownership,
      rowCount,
      sha256: requireString(table.sha256, `table evidence ${name} digest`, SHA256),
      sourceRetained: true,
    };
  });
  if (totalRows === 0) throw new Error('cutover table evidence has zero rows');
  if (careerCheckpoint.aggregateCount === 0) throw new Error('career checkpoint is empty');

  if (Date.parse(capturedAt) > Date.parse(verifiedAt)) {
    throw new Error('Admin snapshot was captured after the final write fence');
  }
  if (expected.maximumAgeMs !== undefined) {
    const now = (expected.now ?? new Date()).getTime();
    if (now - Date.parse(verifiedAt) > expected.maximumAgeMs || Date.parse(verifiedAt) > now + 300_000) {
      throw new Error('cutover evidence is stale');
    }
    if (Date.parse(expiresAt) <= now) throw new Error('cutover write fence lease is expired');
  }
  const expectedEvidenceSha256 = requireString(expected.expectedEvidenceSha256, 'expected evidence digest', SHA256);
  if (sha256CanonicalJson(root) !== expectedEvidenceSha256) throw new Error('cutover evidence digest mismatch');

  return {
    schemaVersion: 1,
    status: 'finalized',
    cutoverReady: true,
    sourceRetained: true,
    eventSilent: true,
    projectRef: PORTFOLIO_SUPABASE_PROJECT_REF,
    imageDigest,
    imageReleaseRunId,
    migrationLedgerDigest,
    writeFence,
    adminSnapshot,
    careerCheckpoint,
    tables,
  };
}
