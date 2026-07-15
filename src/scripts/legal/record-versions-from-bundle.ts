import { parseLegalAuditBundle } from "./legal-audit-config";
import { assertProductionMutationAllowed, LEGAL_AUDIT_WORKFLOW_REF } from "../production-execution-guard";
import { readAndDeleteBundle } from "../../shared/ephemeral-bundle";

async function loadDeploymentBundle(filePath: string): Promise<void> {
  const raw = await readAndDeleteBundle(filePath);
  const bundle = parseLegalAuditBundle(raw);
  process.env.LEGAL_AUDIT_DATABASE_URL = bundle.LEGAL_AUDIT_DATABASE_URL;
  process.env.SUPABASE_CA_CERT = bundle.SUPABASE_CA_CERT;
  process.env.SUPABASE_PROJECT_REF = bundle.SUPABASE_PROJECT_REF;
}

async function main(): Promise<void> {
  assertProductionMutationAllowed(process.env, "Legal audit bundle recording", [LEGAL_AUDIT_WORKFLOW_REF]);
  const bundlePath = process.argv[2];
  if (!bundlePath) throw new Error("Deployment bundle path is required");

  await loadDeploymentBundle(bundlePath);
  await import("./record-versions");
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Legal audit bundle loader failed");
  process.exit(1);
});
