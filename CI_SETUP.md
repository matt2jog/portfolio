# CI setup

One-time configuration for the GitHub Actions workflows in
`.github/workflows/`. After this, every PR runs lint + typecheck + tests,
and every push to `prod` rewrites legal-doc dates and records an audit row
in Supabase.

## Workflows in this repo

| Workflow | Triggers | What it needs |
|---|---|---|
| `ui-test.yml` | PR + push to `main`/`prod` | Nothing extra — pure code-only checks |
| `ui-artifacts.yml` | PR + push to `main`/`prod` | Nothing extra — uploads screenshots as an artifact |
| `backend-unit.yml` | PR + push to `main`/`prod` | `DATABASE_URL` (and `SUPABASE_CA_CERT` if Supabase) |
| `legal-audit.yml` | Push to `prod` touching `legal/**.md` | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, repo **Contents: Read & write** for `GITHUB_TOKEN` |

## 1. Repository secrets

GitHub → repo → **Settings → Secrets and variables → Actions → New
repository secret**. Add each of the following. Names must match exactly.

### For `backend-unit.yml`
- **`DATABASE_URL`** — Postgres connection string. Use a read-only test
  user if possible; the suite is read-only today but plan defensively.
  Example: `postgres://test_ro:<pwd>@<host>:5432/postgres?sslmode=require`
- **`SUPABASE_CA_CERT`** *(optional)* — the Supabase root CA, with literal
  `\n` in place of newlines so it fits in a single-line secret. Only
  required if your DB rejects connections without verified TLS.

### For `legal-audit.yml`
- **`SUPABASE_URL`** — `https://<project-ref>.supabase.co` (no trailing
  slash; the recorder strips one anyway).
- **`SUPABASE_ANON_KEY`** — the anon JWT from Supabase → Project Settings
  → API. The recorder inserts via PostgREST under the anon role; RLS
  policy `legal_document_versions_anon_insert` permits INSERT only.

> The service-role key is **not** used by any workflow — keep it off
> GitHub.

## 2. Workflow permissions

GitHub → repo → **Settings → Actions → General → Workflow permissions**:

- Select **Read and write permissions** (or keep the default and rely on
  the per-workflow `permissions:` block — `legal-audit.yml` declares
  `contents: write` already).
- Tick **Allow GitHub Actions to create and approve pull requests** only
  if you intend to use it elsewhere; the legal audit only pushes commits.

The `legal-audit` workflow uses the built-in `GITHUB_TOKEN` for its
push-back commit (committed as `github-actions[bot]`). No PAT needed.

## 3. Supabase setup

### a. Apply the migration

Open Supabase → **SQL Editor** → paste the contents of
`src/migrations/0005_legal_document_versions.sql` and run.

That creates the `legal_document_versions` table, the
`legal_document_active_ranges` view, the unique-hash + `doc_type` CHECK
constraints, and the anon-INSERT RLS policy.

### b. Verify RLS

Still in Supabase, run:

```sql
SELECT polname, polcmd, polroles::regrole[]
FROM pg_policy
WHERE polrelid = 'legal_document_versions'::regclass;
```

You should see one row: `legal_document_versions_anon_insert` / `INSERT` /
`{anon}`. The anon role must **not** appear on SELECT/UPDATE/DELETE.

### c. Optional: a separate read-only role for `backend-unit.yml`

If you don't want CI tests pointed at your prod DB, provision a separate
Postgres user with `CONNECT` + `USAGE` + `SELECT` on the public schema
only, and use its connection string for the `DATABASE_URL` secret.

## 4. Branch protection rules

GitHub → repo → **Settings → Branches → Branch protection rules**.

### `prod` (production branch)
Create / edit the rule for `prod` and tick:
- **Require a pull request before merging**
- **Require status checks to pass before merging**, and select:
  - `UI Test / ui-test`
  - `UI Artifacts / artifacts`
  - `Backend Unit / backend-unit`
  - `Legal Audit / audit` — **critical for legal compliance**. If
    Supabase is down, this fails and blocks merges. That's intentional.
- **Require branches to be up to date before merging**
- **Restrict who can push to matching branches** — limit to repo admins
- **Do not allow bypassing the above settings**
- Leave **Allow force pushes** disabled

The `github-actions[bot]` commit on `prod` (legal date update with
`[skip ci]`) is exempt because it's a direct push from the workflow's
`GITHUB_TOKEN`; branch protection allows it as long as bypass isn't
explicitly blocked for Actions.

### `main` (working branch, if you use one)
Same as `prod` minus the Legal Audit check (since `legal-audit.yml` only
runs on `prod` pushes).

## 5. Required env vars in `.env` for local parity

The workflows read everything from secrets. To run the equivalent locally:

```
# backend-unit (npm run test:backend-unit)
DATABASE_URL=postgres://...

# legal-audit (npm run legal:record — rarely needed locally)
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
GITHUB_SHA=$(git rev-parse HEAD)
GIT_COMMITTED_AT=$(git show -s --format=%cI HEAD)
```

`record-versions.ts` requires `GITHUB_SHA` and `GIT_COMMITTED_AT` as env
vars — the workflow sets them automatically, but a local run needs them
on the command line.

## 6. Artifact storage

`ui-artifacts.yml` uploads `src/tests/ui-artifacts/{desktop,mobile}/` to a
build artifact named **`ui-artifacts`**. Defaults:

- **Retention**: 90 days (GitHub default; change in repo Settings →
  Actions → General → Artifact and log retention)
- **Size limit**: 500 MB per artifact (GitHub default)
- **Access**: anyone with read access to the repo, via the workflow run's
  Summary page

If you want longer retention or off-GitHub storage, swap the
`actions/upload-artifact@v4` step for a push to S3/GCS — but for visual
review during PR triage, the built-in artifact is plenty.

The audit log itself lives in Supabase, not in GitHub artifacts.

## 7. First-time sanity check

Once secrets and protections are in place:

1. Open a throwaway PR that touches `legal/PRIVACY_POLICY.md` (e.g.,
   change a punctuation mark).
2. Confirm `UI Test`, `UI Artifacts`, and `Backend Unit` checks pass on
   the PR.
3. Merge to `prod`.
4. Watch `Legal Audit` run: it should rewrite the dates, push a follow-up
   `chore(legal): update Last Updated / Effective Date [skip ci]` commit,
   then insert one row into `legal_document_versions`.
5. In Supabase SQL Editor:
   ```sql
   SELECT doc_type, committed_at, left(content_hash, 12) AS hash
   FROM legal_document_versions
   ORDER BY recorded_at DESC LIMIT 5;
   ```
   You should see exactly one new row for `privacy` (the other two docs
   weren't touched, so the unique-hash constraint makes their inserts
   no-ops if you tried, and the workflow only sed-rewrites changed
   files anyway).

## 8. If `legal-audit` keeps failing

- **HTTP 401 from PostgREST**: anon key is wrong or revoked. Regenerate
  in Supabase → API.
- **HTTP 403 / 42501**: RLS policy missing or wrong. Re-run the migration
  from §3a.
- **HTTP 409 / 23505**: not a failure — duplicate hash means the content
  is unchanged from the last recorded version. The recorder logs this as
  `unchanged` and exits 0.
- **Push step fails with 403**: workflow `contents: write` permission
  isn't granted. Check §2.
- **Loop: the bot's commit re-triggers the workflow**: the `if:` guard
  on the `audit` job checks `github.event.head_commit.author.name !=
  'github-actions[bot]'`. If you fork the workflow and change the bot
  identity, update that condition.
