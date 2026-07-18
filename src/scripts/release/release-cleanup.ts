import { readFile } from "node:fs/promises";
import {
  validatePortfolioReleaseRecord,
  type PortfolioReleaseRecord,
} from "./release-record";

function parseRecord(value: unknown): PortfolioReleaseRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("release cleanup record must be an object");
  }
  return validatePortfolioReleaseRecord(value as PortfolioReleaseRecord);
}

export function assertReleaseCleanupAllowed(
  priorValue: unknown,
  currentValue: unknown,
  now = new Date(),
): { prior: PortfolioReleaseRecord; current: PortfolioReleaseRecord } {
  const prior = parseRecord(priorValue);
  const current = parseRecord(currentValue);
  if (prior.releaseSha === current.releaseSha || Date.parse(current.recordedAt) <= Date.parse(prior.recordedAt)) {
    throw new Error("cleanup requires a distinct later successful release");
  }
  if (now.getTime() < Date.parse(prior.cleanupEligibleAfter)) {
    throw new Error("cleanup requires the complete 48-hour retention window");
  }
  if (
    current.previousRevision === prior.candidateRevision
    || current.edgeRollbackState.prior_version === prior.edgeVersion
  ) {
    throw new Error("cleanup target is still the current release rollback target");
  }
  return { prior, current };
}

async function main(): Promise<void> {
  const [priorFilename, currentFilename] = process.argv.slice(2);
  if (!priorFilename || !currentFilename) throw new Error("Prior and current release records are required");
  const [prior, current] = await Promise.all([
    readFile(priorFilename, "utf8").then((value) => JSON.parse(value) as unknown),
    readFile(currentFilename, "utf8").then((value) => JSON.parse(value) as unknown),
  ]);
  const allowed = assertReleaseCleanupAllowed(prior, current);
  process.stdout.write(`${JSON.stringify({
    priorReleaseSha: allowed.prior.releaseSha,
    priorRevision: allowed.prior.candidateRevision,
    priorEdgeVersion: allowed.prior.edgeVersion,
    currentReleaseSha: allowed.current.releaseSha,
    currentRevision: allowed.current.candidateRevision,
    currentEdgeVersion: allowed.current.edgeVersion,
  })}\n`);
}

if (process.argv[1]?.endsWith("release-cleanup.ts")) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Release cleanup validation failed");
    process.exit(1);
  });
}
