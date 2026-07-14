const WRITER_ROLE = "legal_audit_writer";

export function buildLegalWriterConnectionString(base: string, password: string): string {
  const url = new URL(base);
  const originalUser = decodeURIComponent(url.username);
  const dotIndex = originalUser.indexOf(".");
  const tenantSuffix = dotIndex >= 0 ? originalUser.slice(dotIndex) : "";
  url.username = `${WRITER_ROLE}${tenantSuffix}`;
  // URL.password preserves existing percent escapes, so encode the raw secret once here.
  url.password = encodeURIComponent(password);
  return url.toString();
}
