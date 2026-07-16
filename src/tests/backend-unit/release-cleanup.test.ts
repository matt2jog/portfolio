import assert from "node:assert/strict";
import test from "node:test";
import type { PortfolioReleaseRecord } from "../../scripts/release/release-record";
import { assertReleaseCleanupAllowed } from "../../scripts/release/release-cleanup";

function record(overrides: Partial<PortfolioReleaseRecord> = {}): PortfolioReleaseRecord {
  const releaseSha = overrides.releaseSha ?? "a".repeat(40);
  const candidateRevision = overrides.candidateRevision ?? "portfolio--prod-a";
  const edgeVersion = overrides.edgeVersion ?? "edge-a";
  return {
    schemaVersion: 2,
    authorityPhase: "private-irreversible",
    releaseSha,
    imageDigest: `sha256:${"b".repeat(64)}`,
    previousRevision: "portfolio--prod-prior",
    candidateRevision,
    previousRevisionPrivateCompatible: true,
    migrationLedgerDigest: "c".repeat(64),
    cutoverEvidenceSha256: "d".repeat(64),
    runtimeBundleVersion: "1",
    deploymentBundleVersion: "1",
    legalAuditBundleVersion: "1",
    trafficGeneration: "2",
    edgeVersion,
    pubsubConfigurationGeneration: "1",
    cloudRunRollbackState: {
      schema_version: 1,
      release_sha: releaseSha,
      candidate_revision: candidateRevision,
      traffic_before: [{ revisionName: "portfolio--prod-prior", percent: 100 }],
      iam_before: { bindings: [] },
    },
    edgeRollbackState: {
      schema_version: 1,
      worker: "portfolio-edge",
      prior_version: "edge-prior",
      candidate_version: edgeVersion,
      route_snapshot: { schema_version: 1, routes: [] },
    },
    cleanupEligibleAfter: "2026-07-18T12:00:00.000Z",
    cleanupRequiresLaterSuccessfulRelease: true,
    recordedAt: "2026-07-16T12:00:00.000Z",
    ...overrides,
  };
}

test("cleanup requires 48 hours, a later release, and an unreferenced rollback target", () => {
  const prior = record();
  const current = record({
    releaseSha: "e".repeat(40),
    imageDigest: `sha256:${"f".repeat(64)}`,
    previousRevision: "portfolio--prod-intermediate",
    candidateRevision: "portfolio--prod-current",
    edgeVersion: "edge-current",
    recordedAt: "2026-07-19T12:00:00.000Z",
    cleanupEligibleAfter: "2026-07-21T12:00:00.000Z",
    cloudRunRollbackState: {
      schema_version: 1,
      release_sha: "e".repeat(40),
      candidate_revision: "portfolio--prod-current",
      traffic_before: [],
      iam_before: {},
    },
    edgeRollbackState: {
      schema_version: 1,
      worker: "portfolio-edge",
      prior_version: "edge-intermediate",
      candidate_version: "edge-current",
      route_snapshot: {},
    },
  });
  assert.doesNotThrow(() => assertReleaseCleanupAllowed(
    prior,
    current,
    new Date("2026-07-19T13:00:00.000Z"),
  ));
  assert.throws(() => assertReleaseCleanupAllowed(
    prior,
    current,
    new Date("2026-07-17T13:00:00.000Z"),
  ), /48-hour/i);

  const stillReferenced = structuredClone(current);
  stillReferenced.previousRevision = prior.candidateRevision;
  assert.throws(() => assertReleaseCleanupAllowed(
    prior,
    stillReferenced,
    new Date("2026-07-19T13:00:00.000Z"),
  ), /still the current release rollback target/i);
});
