# Portfolio GitHub delivery

Portfolio delivery is owned by GitHub Actions in `C:\Users\matth\OneDrive\Desktop\programs\personal_brand\services\portfolio\.github\workflows`. Cloud Build and `gcloud builds submit` are prohibited.

## Workflows

- `ci.yml` runs only for `pull_request` targeting `main` (plus manual dispatch). It has `contents: read`, receives no repository secrets, and is safe for public forks. It installs dependencies, lints, type-checks, enforces 70% lines/branches/functions/statements, migrates ephemeral pgvector/Postgres, runs backend integration and Playwright UI tests, builds the app and production image, then scans that exact image with Trivy. Critical vulnerabilities and any detected secret block; High vulnerabilities and image misconfiguration are reported.
- `deploy.yml` runs on `main` pushes (plus manual dispatch from `main`). It relies on required PR CI for disposable Postgres migration/integration coverage and does not start localhost Postgres or export a local `DATABASE_URL`. The immutable merge-SHA image carries OCI source/revision labels and is pulled back by digest so provenance is proved before use. The exact-SHA reusable legal audit and finalized cutover-evidence gates both succeed before the first database mutation. Only then does the workflow run the migration bundle and release the digest from `us-east4-docker.pkg.dev/personal-brand-501801/portfolio`.
- `legal-audit.yml` uses its exact-workflow-bound identity and reads only `portfolio-legal-audit-bundle-prod`. It binds the selected Supabase CA to its configured SHA-256 fingerprint, records the checked-in legal Markdown without rewriting or pushing to the protected branch, and receives the immutable workflow SHA explicitly.
- `data-migration.yml` is manual and uses the separately bound `portfolio-data-migration-main` identity. Finalization fetches a compact RS256 JWS directly from Admin with Google OIDC; Portfolio verifies Admin's JWKS signature and exact release SHA, image digest, migration-ledger digest, snapshot/checkpoint, and reviewed 23-table ownership-manifest digest before copying any row. Operator-supplied cutover JSON is not accepted.
- `release-cleanup.yml` is manual, legal-gated, and uses two successful release records. It removes only rollback state that is at least 48 hours old, has a distinct later successful release, and is no longer serving or tagged.

All third-party actions are pinned to reviewed full commit SHAs.

## Release path

The deploy workflow requires exact positive-integer versions in repository variables `PORTFOLIO_RUNTIME_BUNDLE_VERSION` and `PORTFOLIO_DEPLOYMENT_BUNDLE_VERSION`. The legal workflow independently requires `PORTFOLIO_LEGAL_AUDIT_BUNDLE_VERSION`; data migration requires `PORTFOLIO_DATA_MIGRATION_BUNDLE_VERSION` and a reviewed current-SHA image digest. Each workflow validates its selected payload before performing work. Every access writes a mode-0600 temporary file; the consuming parser reads and deletes it before spawning the migration, preflight, release, cleanup, or legal process, with an always-run cleanup as crash recovery. Production never fetches Infisical directly.

`C:\Users\matth\OneDrive\Desktop\programs\personal_brand\services\portfolio\.github\scripts\deploy-cloud-run.sh`:

1. Captures the complete Cloud Run traffic/tag state, IAM policy, current and previous origin-token fingerprints, active edge version, and exact route IDs/owners before changing state.
2. Verifies the current custom domains and raw Cloud Run service URL with the deployment-bundle origin credential.
3. Tags the current 100% revision as `rollback`, then deploys the digest-pinned candidate with zero traffic and a candidate tag.
4. Verifies the candidate accepts only the exact edge credential and returns HTTP 401 without it.
5. Promotes the candidate while it accepts both the current and immediately previous edge credential, then verifies the existing Worker still reaches it.
6. Snapshots the exact current owners of `2jog.dev/*` and `www.2jog.dev/*`, rotates `portfolio-edge` to the current credential, and smokes custom, both raw Cloud Run aliases, and candidate URLs for at least 600 seconds.
7. Automatically rolls back only when the candidate still owns 100% traffic, its recorded image digest matches the release digest, and the previous tagged revision independently passes its authenticated smoke check. The previous Worker version and exact route owners are restored first while the candidate still accepts them; Cloud Run then restores the complete prior traffic/tag and IAM snapshots with concurrency checks.

The prior revision, Worker version, route-owner snapshot, IAM/traffic state, and previous origin token remain retained through a distinct later successful release and for at least 48 hours. The non-secret rollback state is uploaded for 30 days. The cleanup workflow revalidates that the prior revision/version is neither serving nor tagged before deleting only that retained state. On the first split from `resume-vcs-cloud-proxy`, rollback restores that Worker's two Portfolio routes; later releases use the retained Portfolio Worker version. Do not delete `resume-vcs-cloud-proxy` until the Portfolio and Resume grace gates both pass.

Migration `0016_database_audit_compensation.sql` is additive against deployed baseline `37abdbd7a15f`: missing legacy audit context is labeled `pre-audit-37abdbd7a15f` during compatibility. The first successful audited release starts the grace clock; strict context enforcement contracts only after 48 hours and a distinct later successful release.

## Required infrastructure

- Workload Identity provider: `projects/601853536613/locations/global/workloadIdentityPools/personal-brand-github/providers/portfolio-main`.
- Deployment identity: `portfolio-deploy@personal-brand-501801.iam.gserviceaccount.com`, bound with GitHub's direct-workflow `workflow_ref` claim only to numeric GitHub repository ID `1145321973`, `refs/heads/main`, and `matt2jog/portfolio/.github/workflows/deploy.yml@refs/heads/main`.
- Legal-audit identity: `portfolio-legal-audit@personal-brand-501801.iam.gserviceaccount.com`, bound directly through `portfolio-legal-audit-main` or through one exact reusable-caller provider: `portfolio-legal-reusable-main` for deploy, `portfolio-legal-migrate-main` for data migration, and `portfolio-legal-cleanup-main` for cleanup. Every reusable provider binds both its caller `workflow_ref` and the legal workflow `job_workflow_ref`; the identity can read only `portfolio-legal-audit-bundle-prod`.
- Data-migration identity: `portfolio-data-migration@personal-brand-501801.iam.gserviceaccount.com`, bound only to `matt2jog/portfolio/.github/workflows/data-migration.yml@refs/heads/main`. Repository variables pin Admin's cutover URL and Cloud Run OIDC audience; Admin must grant this identity invocation of the evidence endpoint.
- Release-cleanup identity: `portfolio-release-cleanup@personal-brand-501801.iam.gserviceaccount.com`, bound through `portfolio-release-cleanup-main` only to `matt2jog/portfolio/.github/workflows/release-cleanup.yml@refs/heads/main`. It can read the deployment bundle and remove only the retained Cloud Run, Cloudflare, origin-token, and GitHub artifact state validated by the cleanup workflow.
- Runtime identity: `portfolio-runtime@personal-brand-501801.iam.gserviceaccount.com`.
- Artifact Registry repository: `us-east4-docker.pkg.dev/personal-brand-501801/portfolio`.
- Secret Manager bundles: exact repository-variable-selected versions of `portfolio-runtime-bundle-prod`, `portfolio-deployment-bundle-prod`, `portfolio-legal-audit-bundle-prod`, and `portfolio-data-migration-bundle-prod`, synchronized from Infisical by the root workspace workflow. Their database sources are separately scoped; every database boundary carries `PORTFOLIO_SUPABASE_PROJECT_REF`, the verified Supabase CA, and its exact SHA-256 fingerprint. Runtime and deployment contain the same generated `EDGE_ORIGIN_TOKEN`; during rotation both may also contain the immediately previous token until cleanup passes. The deployment Cloudflare output is sourced only from `PORTFOLIO_CLOUDFLARE_API_TOKEN`. No human edits any copy in GCP or Cloudflare.
- Database-role prerequisite: direct logins are privilege-free and `SET ROLE` into NOLOGIN capabilities after the physical session is verified. After `RESET ROLE`, startup and post-migration reconciliation inspect direct-login, cross-schema, `PUBLIC`, table, sequence, column, type, `ALL ROUTINES`, owner, default-privilege, and inherited-role access. `legal_audit_writer` remains INSERT-only on `legal_document_versions`; the migration capability alone owns Portfolio DDL.
- Runtime scope excludes dormant Google OAuth/Kafka values and the paid Apify token. Stored LinkedIn rows remain readable, but provider synchronization is disabled in production until its cost and schema are explicitly re-approved.
- Cloud Run: `portfolio--prod` in `us-east4`, request-based CPU, minimum zero, maximum one, one CPU, 512 MiB.
- Cloudflare DNS: proxied records for both `2jog.dev` and `www.2jog.dev` must exist before release. The deployment identity needs only the scoped Worker script, route, and secret permissions used by the release scripts; DNS changes are a separate reviewed operation.

No GitHub repository secret is required by pull-request CI. Do not add a fallback JSON service-account key, broad Workload Identity provider, shared deployment identity, or `latest` runtime secret reference.

## Branch protection

Protect `main`, require linear history and the `CI / verify` check, disallow direct pushes, and keep required reviewer count at zero. PR #87 targets `main` and must remain there for this CI path to run.

## Local verification

From `C:\Users\matth\OneDrive\Desktop\programs\personal_brand\services\portfolio` run:

```powershell
npm ci
npm run lint
npm run check
npm run build
npm run test:backend-unit
npm run test:coverage
npm run test:client-coverage
npm --prefix infra/cloudflare/portfolio-edge run test:coverage
npm --prefix infra/cloudflare/portfolio-edge run check
docker build --tag portfolio-local:verify .
```

Backend integration tests require an isolated pgvector/Postgres database through `TEST_DATABASE_URL`; never point them at production. CI provisions its own disposable database and applies `npm run db:migrate` before the integration suite.
