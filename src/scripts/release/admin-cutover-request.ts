import {
  ADMIN_CUTOVER_EVIDENCE_AUDIENCE,
  ADMIN_CUTOVER_EVIDENCE_SUBJECT,
} from "./admin-cutover-evidence";
import {
  PORTFOLIO_BRIDGE_MANIFEST_SHA256,
  PORTFOLIO_SUPABASE_PROJECT_REF,
} from "./cutover-evidence";

export interface AdminCutoverEvidenceRequest {
  schemaVersion: 1;
  audience: typeof ADMIN_CUTOVER_EVIDENCE_AUDIENCE;
  purpose: typeof ADMIN_CUTOVER_EVIDENCE_SUBJECT;
  projectRef: typeof PORTFOLIO_SUPABASE_PROJECT_REF;
  releaseSha: string;
  imageDigest: string;
  imageReleaseRunId: string;
  migrationLedgerDigest: string;
  manifestSha256: typeof PORTFOLIO_BRIDGE_MANIFEST_SHA256;
}

export function createAdminCutoverEvidenceRequest(
  releaseSha: string,
  imageDigest: string,
  imageReleaseRunId: string,
  migrationLedgerDigest: string,
): AdminCutoverEvidenceRequest {
  if (!/^[a-f0-9]{40}$/.test(releaseSha)) throw new Error("release SHA is invalid");
  if (!/^sha256:[a-f0-9]{64}$/.test(imageDigest)) throw new Error("image digest is invalid");
  if (!/^[1-9][0-9]*$/.test(imageReleaseRunId)) throw new Error("image release run id is invalid");
  if (!/^[a-f0-9]{64}$/.test(migrationLedgerDigest)) throw new Error("migration ledger digest is invalid");
  return {
    schemaVersion: 1,
    audience: ADMIN_CUTOVER_EVIDENCE_AUDIENCE,
    purpose: ADMIN_CUTOVER_EVIDENCE_SUBJECT,
    projectRef: PORTFOLIO_SUPABASE_PROJECT_REF,
    releaseSha,
    imageDigest,
    imageReleaseRunId,
    migrationLedgerDigest,
    manifestSha256: PORTFOLIO_BRIDGE_MANIFEST_SHA256,
  };
}

function main(): void {
  const [releaseSha, imageDigest, imageReleaseRunId, migrationLedgerDigest] = process.argv.slice(2);
  if (!releaseSha || !imageDigest || !imageReleaseRunId || !migrationLedgerDigest) {
    throw new Error("Release SHA, image digest, image release run, and migration ledger digest are required");
  }
  process.stdout.write(`${JSON.stringify(createAdminCutoverEvidenceRequest(
    releaseSha,
    imageDigest,
    imageReleaseRunId,
    migrationLedgerDigest,
  ))}\n`);
}

if (process.argv[1]?.endsWith("admin-cutover-request.ts")) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Admin cutover request creation failed");
    process.exit(1);
  }
}
