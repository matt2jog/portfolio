import assert from "node:assert/strict";
import test from "node:test";
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
} from "jose";
import {
  ADMIN_CUTOVER_EVIDENCE_AUDIENCE,
  ADMIN_CUTOVER_EVIDENCE_ISSUER,
  ADMIN_CUTOVER_EVIDENCE_SUBJECT,
  verifyAdminCutoverEvidenceJws,
} from "../../scripts/release/admin-cutover-evidence";
import { PORTFOLIO_BRIDGE_MANIFEST_SHA256 } from "../../scripts/release/cutover-evidence";

const now = new Date("2026-07-16T12:00:00.000Z");
const releaseSha = "a".repeat(40);
const imageDigest = `sha256:${"b".repeat(64)}`;
const imageReleaseRunId = "12345";
const migrationLedgerDigest = "c".repeat(64);

async function signedEvidence(overrides: Record<string, unknown> = {}) {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "admin-cutover-1";
  const payload = {
    evidenceSchemaVersion: 1,
    purpose: "portfolio-private-schema-cutover",
    projectRef: "qvbpgvazqfyhwjsfulsb",
    releaseSha,
    imageDigest,
    imageReleaseRunId,
    migrationLedgerDigest,
    manifestSha256: PORTFOLIO_BRIDGE_MANIFEST_SHA256,
    adminSnapshot: {
      snapshotId: "admin-snapshot-1",
      snapshotDigest: "d".repeat(64),
      producerRelease: "e".repeat(40),
      capturedAt: "2026-07-16T11:59:00.000Z",
      resumeCutoverComplete: true,
    },
    careerCheckpoint: {
      generation: "career-generation-1",
      aggregateCount: 23,
      checkpointDigest: "f".repeat(64),
      gapCount: 0,
    },
    ...overrides,
  };
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: jwk.kid })
    .setIssuer(ADMIN_CUTOVER_EVIDENCE_ISSUER)
    .setAudience(ADMIN_CUTOVER_EVIDENCE_AUDIENCE)
    .setSubject(ADMIN_CUTOVER_EVIDENCE_SUBJECT)
    .setJti("admin-cutover-evidence-1")
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(now.getTime() / 1000) + 300)
    .sign(privateKey);
  return { token, keySet: createLocalJWKSet({ keys: [jwk] }) };
}

test("Admin cutover evidence is RS256-verified and release/image/ledger/manifest bound", async () => {
  const { token, keySet } = await signedEvidence();
  const evidence = await verifyAdminCutoverEvidenceJws(token, {
    releaseSha,
    imageDigest,
    imageReleaseRunId,
    migrationLedgerDigest,
    now,
  }, keySet);
  assert.equal(evidence.adminSnapshot.resumeCutoverComplete, true);
  assert.equal(evidence.careerCheckpoint.gapCount, 0);

  await assert.rejects(verifyAdminCutoverEvidenceJws(token, {
    releaseSha: "9".repeat(40),
    imageDigest,
    imageReleaseRunId,
    migrationLedgerDigest,
    now,
  }, keySet), /bound to this release/i);
});

test("Admin cutover evidence rejects manifest drift and event gaps", async () => {
  const drift = await signedEvidence({ manifestSha256: "0".repeat(64) });
  await assert.rejects(verifyAdminCutoverEvidenceJws(drift.token, {
    releaseSha,
    imageDigest,
    imageReleaseRunId,
    migrationLedgerDigest,
    now,
  }, drift.keySet), /manifest|bound/i);

  const gap = await signedEvidence({
    careerCheckpoint: {
      generation: "career-generation-1",
      aggregateCount: 23,
      checkpointDigest: "f".repeat(64),
      gapCount: 1,
    },
  });
  await assert.rejects(verifyAdminCutoverEvidenceJws(gap.token, {
    releaseSha,
    imageDigest,
    imageReleaseRunId,
    migrationLedgerDigest,
    now,
  }, gap.keySet), /event gap/i);
});
