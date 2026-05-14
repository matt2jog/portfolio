/**
 * Records the current content of /legal/*.md to Supabase as audit rows.
 *
 * Idempotent: the unique(doc_type, content_hash) constraint means re-runs on
 * unchanged content insert nothing. Intended to be called from a GitHub
 * Actions workflow that triggers on push to the main branch when legal/**.md
 * changes. Failing the workflow blocks future merges (the workflow is
 * a required status check on the main branch).
 *
 * Connects as the dedicated `legal_audit_writer` Postgres role, which has
 * INSERT-only privilege on legal_document_versions. The connection is built
 * by swapping the credentials of the existing DATABASE_URL with that role's
 * username/password — so we only need one extra secret in CI.
 *
 * Env required:
 *   DATABASE_URL                   — full Postgres URL; host/port/db are reused
 *   LEGAL_AUDIT_WRITE_ROLE_PASSWORD — password for the legal_audit_writer role
 *   GITHUB_SHA                     — commit sha (set by GitHub Actions)
 *   GIT_COMMITTED_AT               — ISO-8601 commit timestamp (workflow computes)
 */

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { Client } from "pg";

const DOCS: Array<{ docType: string; filename: string }> = [
  { docType: "privacy", filename: "PRIVACY_POLICY.md" },
  { docType: "terms", filename: "TERMS_OF_USE.md" },
  { docType: "tracking", filename: "TRACKING_NOTICE_AND_CONSENT.md" },
];

const WRITER_ROLE = "legal_audit_writer";
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1_000;

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildWriterConnectionString(): string {
  const base = required("DATABASE_URL");
  const password = required("LEGAL_AUDIT_WRITE_ROLE_PASSWORD");
  const url = new URL(base);
  url.username = WRITER_ROLE;
  url.password = encodeURIComponent(password);
  return url.toString();
}

async function insertWithRetry(
  client: Client,
  row: {
    doc_type: string;
    content: string;
    content_hash: string;
    commit_sha: string;
    committed_at: string;
  },
): Promise<"inserted" | "duplicate"> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await client.query(
        `INSERT INTO legal_document_versions
           (doc_type, content, content_hash, commit_sha, committed_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          row.doc_type,
          row.content,
          row.content_hash,
          row.commit_sha,
          row.committed_at,
        ],
      );
      return "inserted";
    } catch (err) {
      // 23505 = unique_violation. Expected when content matches the prior
      // recorded version for this doc_type.
      if ((err as { code?: string }).code === "23505") {
        return "duplicate";
      }
      lastErr = err;
      const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
      console.error(
        `[legal-audit] attempt ${attempt}/${MAX_ATTEMPTS} failed for ${row.doc_type}: ${
          (err as Error).message
        }`,
      );
      if (attempt < MAX_ATTEMPTS) {
        console.error(`[legal-audit] retrying in ${delay}ms`);
        await sleep(delay);
      }
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`Insert failed for ${row.doc_type}`);
}

async function main() {
  const commitSha = required("GITHUB_SHA");
  const committedAt = required("GIT_COMMITTED_AT");
  const connectionString = buildWriterConnectionString();

  const sslRequired = connectionString.includes("supabase.com");
  const client = new Client({
    connectionString,
    ssl: sslRequired ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();

  const legalDir = path.resolve(process.cwd(), "legal");
  let inserted = 0;
  let duplicates = 0;

  try {
    for (const { docType, filename } of DOCS) {
      const filePath = path.join(legalDir, filename);
      const content = await readFile(filePath, "utf8");
      const contentHash = sha256(content);
      const result = await insertWithRetry(client, {
        doc_type: docType,
        content,
        content_hash: contentHash,
        commit_sha: commitSha,
        committed_at: committedAt,
      });
      if (result === "inserted") {
        inserted++;
        console.log(
          `[legal-audit] recorded ${docType} (${contentHash.slice(0, 12)})`,
        );
      } else {
        duplicates++;
        console.log(
          `[legal-audit] unchanged ${docType} (${contentHash.slice(0, 12)})`,
        );
      }
    }
  } finally {
    await client.end();
  }

  console.log(
    `[legal-audit] done — inserted=${inserted} unchanged=${duplicates}`,
  );
}

main().catch((err) => {
  console.error("[legal-audit] FAILED:", err);
  process.exit(1);
});
