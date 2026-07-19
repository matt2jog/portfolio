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

Versioning and release gating work through protected git history:

1. Edit one of the `.md` files on a feature branch and open a PR.
2. On every release from protected `main`, `.github/workflows/deploy.yml` calls
   `.github/workflows/legal-audit.yml` with the immutable `${{ github.sha }}`.
3. The reusable workflow rejects anything except a 40-character SHA equal to
   both the caller's `GITHUB_SHA` and the checked-out `HEAD`. It never checks
   out `main` or another moving ref.
4. The checked-in dates remain part of the reviewed binding source. The action
   never rewrites or pushes to the protected branch. It computes a sha256 of
   each document and attempts an idempotent insert into Supabase table
   `portfolio.legal_document_versions` with the exact caller SHA and commit
   timestamp.
5. The production `release` job depends on this called workflow. Migrations,
   candidate deployment, and traffic promotion cannot start unless the legal
   audit job succeeds.

The `unique(doc_type, content_hash)` constraint makes the insert idempotent:
re-runs on unchanged content are no-ops, and re-running the workflow after a
transient failure is safe.

The legal workflow receives only `LEGAL_AUDIT_DATABASE_URL`, sourced from
`PORTFOLIO_LEGAL_AUDIT_DATABASE_URL`. The URL must bind
`legal_audit_writer` to the configured `SUPABASE_PROJECT_REF`; a parsed
Supabase CA whose bytes match `SUPABASE_CA_SHA256` enforces hostname-verified
TLS. The raw JSON file is deleted before
the recorder starts, and the recorder verifies the exact unprivileged
`session_user`/`current_user` after connecting.

The recorder retries 3 times with exponential backoff. A missing or disabled
bundle version, failed WIF exchange, invalid role, unavailable database or
table, TLS failure, or exhausted insert retries fails the called workflow. The
deployment job has no fail-open condition, so the release remains blocked. This
is a post-merge release gate, not a privileged `pull_request` workflow.

`workflow_dispatch` remains available for a safe retry. Its required
`source_sha` must equal the current protected-main run SHA and the exact checked
out commit; it cannot be used to audit an arbitrary or moving ref.

## First-cutover prerequisite

The legal boundary must exist before the first gated release. Do not rely on
that release's migrations to create it, because the audit deliberately runs
before the migration job. Provision and verify all of the following first:

- `portfolio.legal_document_versions`, its constraints and history view, and
  the INSERT-only `legal_audit_writer` grants;
- an enabled `portfolio-legal-audit-bundle-prod` version and numeric
  `PORTFOLIO_LEGAL_AUDIT_BUNDLE_VERSION` repository variable; and
- the dedicated legal-audit WIF/service-account binding. Reusable calls use a
  distinct provider for deploy, data migration, or release cleanup; each binds
  its exact caller `workflow_ref` and the
  `job_workflow_ref` `matt2jog/portfolio/.github/workflows/legal-audit.yml@refs/heads/main`.
  The manual entry point uses the same path as its direct `workflow_ref`.

Provision and independently verify these prerequisites before merging or
enabling the first gated production release. Once the reusable workflow is on
`main`, its manual entry point can retry the current SHA after a failure. If any
prerequisite is absent, the correct first-cutover behavior is a stopped release,
not a concurrent create-and-record race.

## Querying history

The view `portfolio.legal_document_active_ranges` adds an `effective_until`
column via `LEAD()` so you can ask "which version was binding at time T?":

```sql
SELECT *
FROM portfolio.legal_document_active_ranges
WHERE doc_type = 'privacy'
  AND committed_at <= '2026-05-13T00:00:00Z'
  AND (effective_until IS NULL OR effective_until > '2026-05-13T00:00:00Z');
```

Run that via the Supabase SQL editor with a service-role connection. The
dedicated `legal_audit_writer` role used by the workflow has `INSERT`-only
privilege on this one table and **no** `SELECT` — so a leaked workflow
credential cannot read prior versions or touch any other table.

## Starting state

The first successful manual or gated run records the current content of all
three documents. Every later `main` release proves the same immutable content
again; unchanged content is accepted through the idempotent duplicate path.

There is intentionally no historical backfill: prior to this workflow there
was no authoritative public record of what was binding when, so seeding rows
with reconstructed dates would manufacture a paper trail rather than reflect
one. The log is forward-looking from the day it goes live.

## Rolling back

To revert a published policy, revert the commit that introduced it (or
commit the older content again). The next gated release records a new audit row
pointing at the restored content, and the audit history naturally shows the
rollback as another transition.

## Editing rules

- **Never** edit these files directly on `main` — go through a PR so
  reviewers see the legal change.
- **Never** rename or delete a file in this folder. The audit log keys on
  `doc_type`, which is derived from filename in `src/scripts/legal/record-versions.ts`.
  Adding a new doc type requires updating that script, the
  `legal_document_versions.doc_type` CHECK constraint, and the backend route
  in `src/backend/routes.ts`.
