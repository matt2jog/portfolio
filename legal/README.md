# Legal documents

This folder is the **source of truth** for the site's binding legal documents:

- `PRIVACY_POLICY.md`
- `TERMS_OF_USE.md`
- `TRACKING_NOTICE_AND_CONSENT.md`

The backend reads these files directly from disk
(`src/backend/markdown.ts → loadMarkdownAsHtml`) when serving `/api/legal/*`.
The frontend renders the returned HTML in the `Privacy`, `Terms`, and
`Tracking` pages.

## Versioning via git + Supabase audit log

Versioning works through git branching, not a manual workflow:

1. Edit one of the `.md` files on a feature branch and open a PR.
2. On merge to the main branch, the `Legal Audit` GitHub Action
   (`.github/workflows/legal-audit.yml`) fires if any `legal/**.md` changed.
3. The action computes a sha256 of each doc and inserts a row into the
   Supabase `legal_document_versions` table with the commit sha and the
   commit's author timestamp.

The `unique(doc_type, content_hash)` constraint makes the insert idempotent:
re-runs on unchanged content are no-ops, and re-running the workflow after a
transient failure is safe.

The action retries 3 times with exponential backoff. If all retries fail, the
workflow fails. Because the workflow is a required status check on the main
branch, that blocks future merges until the audit can be recorded — the
tradeoff is deliberate (legal audit integrity > merge availability).

## Querying history

The view `legal_document_active_ranges` adds an `effective_until` column via
`LEAD()` so you can ask "which version was binding at time T?":

```sql
SELECT *
FROM legal_document_active_ranges
WHERE doc_type = 'privacy'
  AND committed_at <= '2026-05-13T00:00:00Z'
  AND (effective_until IS NULL OR effective_until > '2026-05-13T00:00:00Z');
```

Run that via the Supabase SQL editor with a service-role connection. The
`anon` role can INSERT only — by design, so a leaked anon key cannot read
prior versions.

## One-time backfill for pre-audit history

The audit log starts at the commit that introduces this workflow. When the
restructuring branch merges to `prod`, the workflow fires on the merge commit
and records the current content as the first audit row for each doc.

If you want the audit log to also reflect the time these documents were
binding *before* this workflow existed (when the `.md` files lived at the
repo root), insert backfill rows once via the Supabase SQL editor. Find each
file's earliest commit time with:

```bash
git log --diff-filter=A --follow --format=%cI -- legal/PRIVACY_POLICY.md | tail -1
```

then insert with the historical commit sha as `commit_sha` and that ISO
timestamp as `committed_at`. The unique-hash constraint protects you from
double-inserting if the historical content matches the current content.

## Rolling back

To revert a published policy, revert the commit that introduced it (or
commit the older content again). The next push to `prod` records a new audit
row pointing at the restored content, and the audit history naturally shows
the rollback as another transition.

## Editing rules

- **Never** edit these files directly on the main branch — go through a PR
  so reviewers see the legal change.
- **Never** rename or delete a file in this folder. The audit log keys on
  `doc_type`, which is derived from filename in `src/scripts/legal/record-versions.ts`.
  Adding a new doc type requires updating that script, the
  `legal_document_versions.doc_type` CHECK constraint, and the backend route
  in `src/backend/routes.ts`.
