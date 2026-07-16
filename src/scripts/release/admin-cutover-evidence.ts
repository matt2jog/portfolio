import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";
import {
  PORTFOLIO_BRIDGE_MANIFEST_SHA256,
  PORTFOLIO_SUPABASE_PROJECT_REF,
  type FinalCutoverEvidence,
} from "./cutover-evidence";

export const ADMIN_CUTOVER_EVIDENCE_ISSUER = "https://admin.2jog.dev";
export const ADMIN_CUTOVER_EVIDENCE_AUDIENCE = "portfolio-data-migration";
export const ADMIN_CUTOVER_EVIDENCE_SUBJECT = "portfolio-private-schema-cutover";
export const ADMIN_CUTOVER_EVIDENCE_JWKS_URL =
  "https://admin.2jog.dev/.well-known/jwks.json";

const remoteKeySet = createRemoteJWKSet(new URL(ADMIN_CUTOVER_EVIDENCE_JWKS_URL));
const SHA256 = /^[a-f0-9]{64}$/;
const RELEASE_SHA = /^[a-f0-9]{40}$/;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export interface AdminCutoverGateEvidence {
  adminSnapshot: FinalCutoverEvidence["adminSnapshot"];
  careerCheckpoint: FinalCutoverEvidence["careerCheckpoint"];
}

export interface ExpectedAdminCutoverEvidence {
  releaseSha: string;
  imageDigest: string;
  imageReleaseRunId: string;
  migrationLedgerDigest: string;
  now?: Date;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} keys are not exact`);
  }
}

function string(value: unknown, pattern: RegExp, label: string): string {
  if (typeof value !== "string" || !pattern.test(value)) throw new Error(`${label} is invalid`);
  return value;
}

function nonempty(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} is invalid`);
  return value;
}

function safeCount(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${label} is invalid`);
  return value as number;
}

export async function verifyAdminCutoverEvidenceJws(
  compactJws: string,
  expected: ExpectedAdminCutoverEvidence,
  keySet: JWTVerifyGetKey = remoteKeySet,
): Promise<AdminCutoverGateEvidence> {
  if (!RELEASE_SHA.test(expected.releaseSha)) throw new Error("expected release SHA is invalid");
  if (!/^sha256:[a-f0-9]{64}$/.test(expected.imageDigest)) throw new Error("expected image digest is invalid");
  if (!/^[1-9][0-9]*$/.test(expected.imageReleaseRunId)) throw new Error("expected image release run id is invalid");
  if (!SHA256.test(expected.migrationLedgerDigest)) throw new Error("expected migration ledger digest is invalid");

  const { payload, protectedHeader } = await jwtVerify(compactJws, keySet, {
    algorithms: ["RS256"],
    issuer: ADMIN_CUTOVER_EVIDENCE_ISSUER,
    audience: ADMIN_CUTOVER_EVIDENCE_AUDIENCE,
    subject: ADMIN_CUTOVER_EVIDENCE_SUBJECT,
    requiredClaims: ["iat", "exp", "jti"],
    currentDate: expected.now,
    clockTolerance: 5,
  });
  if (protectedHeader.typ !== "JWT" || typeof protectedHeader.kid !== "string" || protectedHeader.kid.length === 0) {
    throw new Error("Admin cutover evidence protected header is invalid");
  }
  if (
    typeof payload.iat !== "number"
    || typeof payload.exp !== "number"
    || payload.exp <= payload.iat
    || payload.exp - payload.iat > 300
  ) {
    throw new Error("Admin cutover evidence lifetime is invalid");
  }
  if (
    payload.evidenceSchemaVersion !== 1
    || payload.purpose !== "portfolio-private-schema-cutover"
    || payload.projectRef !== PORTFOLIO_SUPABASE_PROJECT_REF
    || payload.releaseSha !== expected.releaseSha
    || payload.imageDigest !== expected.imageDigest
    || payload.imageReleaseRunId !== expected.imageReleaseRunId
    || payload.migrationLedgerDigest !== expected.migrationLedgerDigest
    || payload.manifestSha256 !== PORTFOLIO_BRIDGE_MANIFEST_SHA256
  ) {
    throw new Error("Admin cutover evidence is not bound to this release, image, ledger, project, and manifest");
  }

  const snapshot = record(payload.adminSnapshot, "Admin snapshot");
  exactKeys(snapshot, ["snapshotId", "snapshotDigest", "producerRelease", "capturedAt", "resumeCutoverComplete"], "Admin snapshot");
  if (snapshot.resumeCutoverComplete !== true) throw new Error("Admin snapshot does not prove Resume cutover");
  const capturedAt = string(snapshot.capturedAt, UTC_TIMESTAMP, "Admin snapshot capture time");
  if (Number.isNaN(Date.parse(capturedAt))) throw new Error("Admin snapshot capture time is invalid");

  const checkpoint = record(payload.careerCheckpoint, "career checkpoint");
  exactKeys(checkpoint, ["generation", "aggregateCount", "checkpointDigest", "gapCount"], "career checkpoint");
  if (checkpoint.gapCount !== 0) throw new Error("career checkpoint has an event gap");
  const aggregateCount = safeCount(checkpoint.aggregateCount, "career checkpoint aggregate count");
  if (aggregateCount === 0) throw new Error("career checkpoint is empty");

  return {
    adminSnapshot: {
      snapshotId: nonempty(snapshot.snapshotId, "Admin snapshot id"),
      snapshotDigest: string(snapshot.snapshotDigest, SHA256, "Admin snapshot digest"),
      producerRelease: string(snapshot.producerRelease, RELEASE_SHA, "Admin producer release"),
      capturedAt,
      resumeCutoverComplete: true,
    },
    careerCheckpoint: {
      generation: nonempty(checkpoint.generation, "career checkpoint generation"),
      aggregateCount,
      checkpointDigest: string(checkpoint.checkpointDigest, SHA256, "career checkpoint digest"),
      gapCount: 0,
    },
  };
}
