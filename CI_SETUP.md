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
| `legal-audit.yml` | Push to `prod` touching `legal/**.md` | `DATABASE_URL`, `LEGAL_AUDIT_WRITE_ROLE_PASSWORD`, repo **Contents: Read & write** for `GITHUB_TOKEN` |

## 1. Repository secrets

GitHub → repo → **Settings → Secrets and variables → Actions → New
repository secret**. Add each of the following. Names must match exactly.

### For `backend-unit.yml`
- **`DATABASE_URL`** — Postgres connection string for the read-only test
  user. Example: `postgres://test_ro:<pwd>@<host>:5432/postgres?sslmode=require`
- **`SUPABASE_CA_CERT`** *(optional)* — the Supabase root CA, with literal
  `\n` in place of newlines so it fits in a single-line secret. Only
  required if your DB rejects connections without verified TLS.

### For `legal-audit.yml`
- **`DATABASE_URL`** — reused from above. The recorder parses out the
  host/port/db and swaps in the writer role's credentials, so we don't
  need a second URL.
- **`LEGAL_AUDIT_WRITE_ROLE_PASSWORD`** — password for the
  `legal_audit_writer` Postgres role (see §3). The role has
  `INSERT`-only privilege on `legal_document_versions` and **no** SELECT,
  so a leaked password cannot read past versions or touch any other
  table. Rotate with `ALTER ROLE legal_audit_writer PASSWORD '...';`.

> **Anon key is intentionally not used.** Supabase anon JWTs are designed
> to be public (they ship in client apps), so they're a weak boundary even
> behind RLS. A dedicated DB role with one verb on one table is a real
> least-privilege credential and can be revoked instantly with
> `DROP ROLE legal_audit_writer` without touching anything else.

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
constraints, and enables RLS.

### b. Create the dedicated writer role

```sql
CREATE ROLE legal_audit_writer LOGIN PASSWORD '<strong-random>' NOINHERIT;
GRANT USAGE ON SCHEMA public TO legal_audit_writer;
GRANT INSERT ON legal_document_versions TO legal_audit_writer;

DROP POLICY IF EXISTS legal_document_versions_anon_insert ON legal_document_versions;
CREATE POLICY legal_audit_writer_insert
  ON legal_document_versions
  FOR INSERT
  TO legal_audit_writer
  WITH CHECK (true);
```

Stash the password in your password manager and as the
`LEGAL_AUDIT_WRITE_ROLE_PASSWORD` GitHub secret. **This has been done
for this project — skip if already in place.**

### c. Verify the role has nothing else

```sql
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'legal_audit_writer';
```

Should return exactly one row: `legal_document_versions / INSERT`. If you
see SELECT/UPDATE/DELETE or any other table, revoke them.

### d. Optional: a separate read-only role for `backend-unit.yml`

If you don't want CI tests pointed at your prod DB, provision another
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
`[skip ci]`) is a direct push from the workflow's `GITHUB_TOKEN`; branch
protection allows it as long as bypass isn't explicitly blocked for
Actions.

### `main` (working branch, if you use one)
Same as `prod` minus the Legal Audit check (since `legal-audit.yml` only
runs on `prod` pushes).

## 5. Required env vars in `.env` for local parity

The workflows read everything from secrets. To run the equivalent locally:

```
# backend-unit (npm run test:backend-unit)
DATABASE_URL=postgres://...

# legal-audit (npm run legal:record — rarely needed locally)
DATABASE_URL=postgres://...                  # same as above
LEGAL_AUDIT_WRITE_ROLE_PASSWORD=...          # already in .env
GITHUB_SHA=$(git rev-parse HEAD)
GIT_COMMITTED_AT=$(git show -s --format=%cI HEAD)
```

`record-versions.ts` builds the writer connection string by reusing the
host/port/db from `DATABASE_URL` and swapping in `legal_audit_writer` +
the password. `GITHUB_SHA` and `GIT_COMMITTED_AT` are set automatically
by the workflow; a local run needs them on the command line.

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
5. In Supabase SQL Editor (using your normal owner/service-role
   connection — not the writer role, which has no SELECT):
   ```sql
   SELECT doc_type, committed_at, left(content_hash, 12) AS hash
   FROM legal_document_versions
   ORDER BY recorded_at DESC LIMIT 5;
   ```
   You should see one new row for `privacy`. The other docs weren't
   touched, so even if the recorder tried, the unique-hash constraint
   would make them no-ops — and the workflow only sed-rewrites changed
   files anyway.

## 8. If `legal-audit` keeps failing

- **`28P01` / authentication failed**: wrong
  `LEGAL_AUDIT_WRITE_ROLE_PASSWORD`. Rotate with
  `ALTER ROLE legal_audit_writer PASSWORD '...'` and update the secret.
- **`42501` / permission denied for table legal_document_versions**:
  GRANT or POLICY missing. Re-run §3b.
- **`23505` / duplicate key value violates unique constraint**: not a
  failure — duplicate hash means the content is unchanged from the last
  recorded version. The recorder logs this as `unchanged` and exits 0.
- **`ENOTFOUND` / host unreachable**: `DATABASE_URL` host is wrong, or
  the network blocks egress from GitHub runners. Supabase pooler hosts
  are usually `<project>.pooler.supabase.com` — make sure you're using
  the direct-connection host, not the pooler, since the writer role logs
  in directly.
- **Push step fails with 403**: workflow `contents: write` permission
  isn't granted. Check §2.
- **Loop: the bot's commit re-triggers the workflow**: the `if:` guard
  on the `audit` job checks `github.event.head_commit.author.name !=
  'github-actions[bot]'`. If you fork the workflow and change the bot
  identity, update that condition.
