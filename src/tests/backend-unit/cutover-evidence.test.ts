import assert from "node:assert/strict";
import test from "node:test";
import {
  PORTFOLIO_BRIDGE_MANIFEST_SHA256,
  parseFinalCutoverEvidence,
  sha256CanonicalJson,
  type FinalCutoverEvidence,
} from "../../scripts/release/cutover-evidence";
import { PORTFOLIO_BRIDGE_MANIFEST } from "../../scripts/legacy-data-migration";

function validEvidence(): FinalCutoverEvidence {
  return {
    schemaVersion: 1,
    status: "finalized",
    cutoverReady: true,
    sourceRetained: true,
    eventSilent: true,
    projectRef: "qvbpgvazqfyhwjsfulsb",
    imageDigest: `sha256:${"a".repeat(64)}`,
    imageReleaseRunId: "12345",
    migrationLedgerDigest: "b".repeat(64),
    writeFence: {
      fenceId: "fence-2026-07-15",
      active: true,
      verifiedAt: "2026-07-15T20:00:00.000Z",
      expiresAt: "2026-07-15T20:15:00.000Z",
      triggerDigest: "c".repeat(64),
    },
    adminSnapshot: {
      snapshotId: "snapshot-42",
      snapshotDigest: "d".repeat(64),
      producerRelease: "e".repeat(40),
      capturedAt: "2026-07-15T19:59:00.000Z",
      resumeCutoverComplete: true,
    },
    careerCheckpoint: {
      generation: "generation-42",
      aggregateCount: 2,
      checkpointDigest: "f".repeat(64),
      gapCount: 0,
    },
    tables: PORTFOLIO_BRIDGE_MANIFEST.map(({ table, ownership }, index) => ({
      table,
      ownership,
      rowCount: index === 0 ? 1 : 0,
      sha256: (index % 10).toString().repeat(64),
      sourceRetained: true,
    })),
  };
}

test("final cutover evidence is canonical, digest-bound, and fail-closed", () => {
  const evidence = validEvidence();
  const raw = JSON.stringify(evidence);
  const digest = sha256CanonicalJson(evidence);
  assert.deepEqual(parseFinalCutoverEvidence(raw, {
    expectedProjectRef: "qvbpgvazqfyhwjsfulsb",
    expectedImageDigest: evidence.imageDigest,
    expectedEvidenceSha256: digest,
  }), evidence);

  for (const invalid of [
    { ...evidence, cutoverReady: false },
    { ...evidence, sourceRetained: false },
    { ...evidence, eventSilent: false },
    { ...evidence, projectRef: "abcdefghijklmnopqrst" },
    { ...evidence, tables: [] },
    { ...evidence, careerCheckpoint: { ...evidence.careerCheckpoint, gapCount: 1 } },
    { ...evidence, writeFence: { ...evidence.writeFence, active: false } },
    { ...evidence, adminSnapshot: { ...evidence.adminSnapshot, resumeCutoverComplete: false } },
  ]) {
    assert.throws(() => parseFinalCutoverEvidence(JSON.stringify(invalid), {
      expectedProjectRef: "qvbpgvazqfyhwjsfulsb",
      expectedImageDigest: evidence.imageDigest,
      expectedEvidenceSha256: sha256CanonicalJson(invalid),
    }), /cutover|evidence|project|table|checkpoint|fence|snapshot/i);
  }
});

test("evidence digest rejects byte-independent semantic drift", () => {
  const evidence = validEvidence();
  assert.throws(() => parseFinalCutoverEvidence(JSON.stringify(evidence), {
    expectedProjectRef: evidence.projectRef,
    expectedImageDigest: evidence.imageDigest,
    expectedEvidenceSha256: "0".repeat(64),
  }), /digest/i);
});

test("evidence is bound to the exact reviewed 23-table ownership manifest", () => {
  const evidence = validEvidence();
  assert.equal(evidence.tables.length, 23);
  assert.match(PORTFOLIO_BRIDGE_MANIFEST_SHA256, /^[a-f0-9]{64}$/);

  const missing = { ...evidence, tables: evidence.tables.slice(0, -1) };
  assert.throws(() => parseFinalCutoverEvidence(missing, {
    expectedProjectRef: evidence.projectRef,
    expectedImageDigest: evidence.imageDigest,
    expectedEvidenceSha256: sha256CanonicalJson(missing),
  }), /exact 23-table ownership manifest/i);

  const wrongOwnership = structuredClone(evidence);
  wrongOwnership.tables[0].ownership = "hybrid";
  assert.throws(() => parseFinalCutoverEvidence(wrongOwnership, {
    expectedProjectRef: evidence.projectRef,
    expectedImageDigest: evidence.imageDigest,
    expectedEvidenceSha256: sha256CanonicalJson(wrongOwnership),
  }), /exact Portfolio ownership manifest/i);
});
