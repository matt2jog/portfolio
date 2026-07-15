/**
 * Records the current content of /legal/*.md to Supabase as audit rows.
 *
 * Idempotent: the unique(doc_type, content_hash) constraint means re-runs on
 * unchanged content insert nothing. Intended to be called from a GitHub
 * Actions workflow that triggers on a protected-main push when legal/**.md
 * changes. The workflow never rewrites or pushes legal source.
 *
 * Connects through the dedicated legal-audit URL as `legal_audit_writer`,
 * which has INSERT-only privilege on legal_document_versions.
 *
 * Env required:
 *   LEGAL_AUDIT_DATABASE_URL       - scoped legal_audit_writer Postgres URL
 *   SUPABASE_CA_CERT               - CA used for verified Supabase TLS
 *   SUPABASE_PROJECT_REF           - exact Supabase project reference
 *   GITHUB_SHA                     - commit sha (set by GitHub Actions)
 *   GIT_COMMITTED_AT               - ISO-8601 commit timestamp (workflow computes)
 */

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { Client } from "pg";
import {
  postgresConnectionConfig,
  productionSupabaseConnectionConfig,
} from "../../shared/postgres-tls";
import { assertUnprivilegedDatabaseSession } from "../../shared/postgres-session";
import { assertProductionMutationAllowed, LEGAL_AUDIT_WORKFLOW_REF } from "../production-execution-guard";

const DOCS: Array<{ docType: string; filename: string }> = [
  { docType: "privacy", filename: "PRIVACY_POLICY.md" },
  { docType: "terms", filename: "TERMS_OF_USE.md" },
  { docType: "tracking", filename: "TRACKING_NOTICE_AND_CONSENT.md" },
];

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

function legalAuditDatabaseUrl(): string {
  const scopedUrl = process.env.LEGAL_AUDIT_DATABASE_URL;
  if (scopedUrl) return scopedUrl;
  if (process.env.NODE_ENV !== "production") return required("DATABASE_URL");
  throw new Error("Missing required env var: LEGAL_AUDIT_DATABASE_URL");
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
  assertProductionMutationAllowed(process.env, "Legal audit recording", [LEGAL_AUDIT_WORKFLOW_REF]);
  const commitSha = required("GITHUB_SHA");
  const committedAt = required("GIT_COMMITTED_AT");
  const connectionString = legalAuditDatabaseUrl();

  const client = new Client({
    ...(process.env.NODE_ENV === "production"
      ? productionSupabaseConnectionConfig({
        databaseUrl: connectionString,
        projectRef: process.env.SUPABASE_PROJECT_REF ?? "",
        supabaseCaCert: process.env.SUPABASE_CA_CERT,
        expectedRole: "legal_audit_writer",
      })
      : postgresConnectionConfig(connectionString, process.env.SUPABASE_CA_CERT)),
  });

  await client.connect();
  if (process.env.NODE_ENV === "production") {
    await assertUnprivilegedDatabaseSession(client, "legal_audit_writer", "Portfolio legal audit");
  }

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
