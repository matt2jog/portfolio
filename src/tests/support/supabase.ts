import { rootCertificates } from "node:tls";
import { certificateSha256 } from "../../shared/postgres-tls";

export const TEST_SUPABASE_PROJECT_REF = "qvbpgvazqfyhwjsfulsb";
export const TEST_SUPABASE_CA_CERT = rootCertificates[0];
export const TEST_SUPABASE_CA_SHA256 = certificateSha256(TEST_SUPABASE_CA_CERT);

export function testSupabaseDatabaseUrl(
  role: string,
  options: { projectRef?: string; direct?: boolean; port?: 5432 | 6543 } = {},
): string {
  const projectRef = options.projectRef ?? TEST_SUPABASE_PROJECT_REF;
  const direct = options.direct ?? false;
  const port = options.port ?? 5432;
  const host = direct
    ? "db." + projectRef + ".supabase.co"
    : "aws-0-us-east-1.pooler.supabase.com";
  const username = direct ? role : role + "." + projectRef;
  const url = new URL("postgresql://" + host + ":" + port + "/postgres");
  url.username = username;
  url.password = "fixture-password";
  return url.toString();
}
