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
2. On merge to protected `main`, the `Legal Audit` GitHub Action
   (`.github/workflows/legal-audit.yml`) fires if any `legal/**.md` changed.
3. The checked-in dates remain part of the reviewed binding source. The action
   never rewrites or pushes to the protected branch. It computes a sha256 of
   each document and inserts a row into the Supabase
   `legal_document_versions` table with the commit sha and the commit's
   author timestamp.

The `unique(doc_type, content_hash)` constraint makes the insert idempotent:
re-runs on unchanged content are no-ops, and re-running the workflow after a
transient failure is safe.

The recorder retries 3 times with exponential backoff. If all retries fail, the
workflow fails. The audit is post-merge (the workflow runs on push to `main`,
not as a PR gate) so a Supabase outage does not block merges, but a failed
run will surface in the Actions tab and should be re-run manually before
relying on the audit for that commit.

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
dedicated `legal_audit_writer` role used by the workflow has `INSERT`-only
privilege on this one table and **no** `SELECT` — so a leaked workflow
credential cannot read prior versions or touch any other table.

## Starting state

The audit log starts empty. The first push to `main` that merges this folder
(or any later edit to a `legal/**.md` file) will fire the workflow and record
the current content of each changed doc as its first audit row.

There is intentionally no historical backfill: prior to this workflow there
was no authoritative public record of what was binding when, so seeding rows
with reconstructed dates would manufacture a paper trail rather than reflect
one. The log is forward-looking from the day it goes live.

## Rolling back

To revert a published policy, revert the commit that introduced it (or
commit the older content again). The next push to `main` records a new audit
row pointing at the restored content, and the audit history naturally shows
the rollback as another transition.

## Editing rules

- **Never** edit these files directly on `main` — go through a PR so
  reviewers see the legal change.
- **Never** rename or delete a file in this folder. The audit log keys on
  `doc_type`, which is derived from filename in `src/scripts/legal/record-versions.ts`.
  Adding a new doc type requires updating that script, the
  `legal_document_versions.doc_type` CHECK constraint, and the backend route
  in `src/backend/routes.ts`.
