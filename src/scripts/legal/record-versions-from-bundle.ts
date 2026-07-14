import { readFile } from "node:fs/promises";
import { parseLegalAuditBundle } from "./legal-audit-config";
import { assertProductionMutationAllowed } from "../production-execution-guard";

async function loadDeploymentBundle(filePath: string): Promise<void> {
  const raw = await readFile(filePath, "utf8");
  const bundle = parseLegalAuditBundle(raw);
  process.env.DATABASE_URL = bundle.DATABASE_URL;
  process.env.LEGAL_AUDIT_WRITE_ROLE_PASSWORD = bundle.LEGAL_AUDIT_WRITE_ROLE_PASSWORD;
  process.env.SUPABASE_CA_CERT = bundle.SUPABASE_CA_CERT;
}

async function main(): Promise<void> {
  assertProductionMutationAllowed(process.env, "Legal audit bundle recording");
  const bundlePath = process.argv[2];
  if (!bundlePath) throw new Error("Deployment bundle path is required");

  await loadDeploymentBundle(bundlePath);
  await import("./record-versions");
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Legal audit bundle loader failed");
  process.exit(1);
});
