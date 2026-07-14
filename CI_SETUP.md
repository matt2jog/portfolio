# Portfolio GitHub delivery

Portfolio delivery is owned by GitHub Actions in `C:\Users\matth\OneDrive\Desktop\programs\personal_brand\services\portfolio\.github\workflows`. Cloud Build and `gcloud builds submit` are prohibited.

## Workflows

- `ci.yml` runs only for `pull_request` targeting `main` (plus manual dispatch). It has `contents: read`, receives no repository secrets, and is safe for public forks. It installs dependencies, lints, type-checks, enforces 70% lines/branches/functions/statements, migrates ephemeral pgvector/Postgres, runs backend integration and Playwright UI tests, builds the app and production image, then scans that exact image with Trivy. Critical vulnerabilities and any detected secret block; High vulnerabilities and image misconfiguration are reported.
- `deploy.yml` runs on `main` pushes (plus manual dispatch from `main`). It repeats verification, builds the immutable merge-SHA image, scans before push, authenticates through the repository-bound `portfolio-main` Workload Identity provider, and pushes only to `us-east4-docker.pkg.dev/personal-brand-501801/portfolio`.
- `legal-audit.yml` uses its exact-workflow-bound identity and reads only `portfolio-legal-audit-bundle-prod`. It records the checked-in legal Markdown without rewriting or pushing to the protected branch.

All third-party actions are pinned to reviewed full commit SHAs.

## Release path

The deploy workflow requires exact positive-integer versions in repository variables `PORTFOLIO_RUNTIME_BUNDLE_VERSION` and `PORTFOLIO_DEPLOYMENT_BUNDLE_VERSION`. The legal workflow independently requires `PORTFOLIO_LEGAL_AUDIT_BUNDLE_VERSION`. Each workflow validates its selected payload before performing work. Production never fetches Infisical directly.

`C:\Users\matth\OneDrive\Desktop\programs\personal_brand\services\portfolio\.github\scripts\deploy-cloud-run.sh`:

1. Verifies the current custom domains and raw Cloud Run service URL with the deployment-bundle origin credential.
2. Tags the current 100% revision as `rollback`.
3. Deploys the digest-pinned candidate with zero traffic and a candidate tag.
4. Verifies the candidate accepts only the exact edge credential and returns HTTP 401 without it.
5. Promotes the candidate while it accepts both the current and immediately previous edge credential, then verifies the existing Worker still reaches it.
6. Snapshots the exact current owners of `2jog.dev/*` and `www.2jog.dev/*`, rotates `portfolio-edge` to the current credential, and smokes custom, both raw Cloud Run aliases, and candidate URLs for at least 600 seconds.
7. Automatically rolls back only when the candidate still owns 100% traffic, its recorded image digest matches the release digest, and the previous tagged revision independently passes its authenticated smoke check. The previous Worker or route owner is restored first while the candidate still accepts it; Cloud Run traffic then returns to the previous revision.

The prior revision, Worker version, and route-owner snapshot remain retained through the next successful release and for at least 48 hours. The non-secret rollback state is uploaded for three days. On the first split from `resume-vcs-cloud-proxy`, rollback restores that Worker's two Portfolio routes; later releases use Wrangler version rollback. Do not delete `resume-vcs-cloud-proxy` until the Portfolio and Resume grace gates both pass.

## Required infrastructure

- Workload Identity provider: `projects/601853536613/locations/global/workloadIdentityPools/personal-brand-github/providers/portfolio-main`.
- Deployment identity: `portfolio-deploy@personal-brand-501801.iam.gserviceaccount.com`, bound with GitHub's direct-workflow `workflow_ref` claim only to numeric GitHub repository ID `1145321973`, `refs/heads/main`, and `matt2jog/portfolio/.github/workflows/deploy.yml@refs/heads/main`.
- Legal-audit identity: `portfolio-legal-audit@personal-brand-501801.iam.gserviceaccount.com`, bound with `workflow_ref` through `portfolio-legal-audit-main` only to `matt2jog/portfolio/.github/workflows/legal-audit.yml@refs/heads/main` and allowed to read only `portfolio-legal-audit-bundle-prod`.
- Runtime identity: `portfolio-runtime@personal-brand-501801.iam.gserviceaccount.com`.
- Artifact Registry repository: `us-east4-docker.pkg.dev/personal-brand-501801/portfolio`.
- Secret Manager bundles: exact repository-variable-selected versions of `portfolio-runtime-bundle-prod`, `portfolio-deployment-bundle-prod`, and `portfolio-legal-audit-bundle-prod`, synchronized from Infisical by the root workspace workflow. Runtime and deployment contain the same generated `EDGE_ORIGIN_TOKEN`; during rotation both may also contain the immediately previous token until the rollback grace period ends. The isolated legal bundle contains only its database URL, writer password, and verified Supabase CA. No human edits any copy in GCP or Cloudflare.
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
npm run test:ui
docker build --tag portfolio-local:verify .
```

Backend integration tests require an isolated pgvector/Postgres database through `TEST_DATABASE_URL`; never point them at production. CI provisions its own disposable database and applies `npm run db:migrate` before the integration suite.
