/**
 * Records the current content of /legal/*.md to Supabase as audit rows.
 *
 * Idempotent: the unique(doc_type, content_hash) constraint means re-runs on
 * unchanged content insert nothing. Intended to be called from a GitHub
 * Actions workflow that triggers on push to the main branch when legal/**.md
 * changes. Failing the workflow blocks future merges (the workflow is
 * a required status check on the main branch).
 *
 * Env required:
 *   SUPABASE_URL              — https://<project>.supabase.co
 *   SUPABASE_ANON_KEY         — anon JWT; RLS policy permits INSERT only
 *   GITHUB_SHA                — commit sha (provided by GitHub Actions)
 *   GIT_COMMITTED_AT          — ISO-8601 commit timestamp (workflow computes from `git show`)
 */

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

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

async function insertWithRetry(
  supabaseUrl: string,
  anonKey: string,
  row: Record<string, unknown>,
): Promise<"inserted" | "duplicate"> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/legal_document_versions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
            Prefer: "return=minimal",
          },
          body: JSON.stringify(row),
        },
      );
      if (res.ok) return "inserted";
      const body = await res.text();
      // PostgREST returns 409 with code 23505 on unique constraint violation —
      // that's expected when content hasn't changed since the last record.
      if (res.status === 409 && body.includes("23505")) {
        return "duplicate";
      }
      throw new Error(`HTTP ${res.status}: ${body}`);
    } catch (err) {
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
  const supabaseUrl = required("SUPABASE_URL").replace(/\/$/, "");
  const anonKey = required("SUPABASE_ANON_KEY");
  const commitSha = required("GITHUB_SHA");
  const committedAt = required("GIT_COMMITTED_AT");

  const legalDir = path.resolve(process.cwd(), "legal");
  let inserted = 0;
  let duplicates = 0;

  for (const { docType, filename } of DOCS) {
    const filePath = path.join(legalDir, filename);
    const content = await readFile(filePath, "utf8");
    const contentHash = sha256(content);
    const result = await insertWithRetry(supabaseUrl, anonKey, {
      doc_type: docType,
      content,
      content_hash: contentHash,
      commit_sha: commitSha,
      committed_at: committedAt,
    });
    if (result === "inserted") {
      inserted++;
      console.log(`[legal-audit] recorded ${docType} (${contentHash.slice(0, 12)})`);
    } else {
      duplicates++;
      console.log(`[legal-audit] unchanged ${docType} (${contentHash.slice(0, 12)})`);
    }
  }

  console.log(`[legal-audit] done — inserted=${inserted} unchanged=${duplicates}`);
}

main().catch((err) => {
  console.error("[legal-audit] FAILED:", err);
  process.exit(1);
});
