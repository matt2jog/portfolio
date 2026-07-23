# 2jog.dev â€” personal brand portfolio

A full-stack personal-brand portfolio site. Single deployable: an Express
backend on port 3000 that serves API routes, runs the Vite dev server in
development, and serves the prebuilt SPA in production.

- Frontend: React 19 + Vite + Tailwind v4 + Wouter routing + TanStack Query
  + Three.js / R3F + GSAP + Framer Motion
- Backend: Express 5 + Drizzle ORM + Supabase Postgres + strict Admin Dashboard
  RS256/JWKS identity consumption + authenticated Google Pub/Sub push projection
- AI: pluggable LLM provider stack (Gradient primary, Fireworks fallback)
  driving the project-chat agent with tool use and an output evaluator
- Observability/compliance: GeoIP-gated US-only access, consent clickwrap,
  LogRocket session capture (post-consent only), append-only Supabase audit
  log for legal-document versions

## Repository layout

```
portfolio/
â”œâ”€â”€ legal/                       # source of truth for binding legal docs
â”‚   â”œâ”€â”€ PRIVACY_POLICY.md
â”‚   â”œâ”€â”€ TERMS_OF_USE.md
â”‚   â”œâ”€â”€ TRACKING_NOTICE_AND_CONSENT.md
â”‚   â””â”€â”€ README.md                # audit-log + workflow docs
â”œâ”€â”€ src/
â”‚   â”œâ”€â”€ client/                  # Vite + React SPA (index.html, src/)
â”‚   â”œâ”€â”€ backend/                 # Express server, agent, auth, integrations
â”‚   â”‚   â”œâ”€â”€ data/db.ts           # Drizzle + pg pool
â”‚   â”‚   â””â”€â”€ agent/               # LLM provider, tools, rules, evaluator
â”‚   â”œâ”€â”€ scripts/                 # build, migrations, release tooling, legal recorder
â”‚   â”œâ”€â”€ shared/                  # Drizzle schema, types reused by both sides
â”‚   â”œâ”€â”€ tests/                   # Playwright: assertions + viewport screenshots
â”‚   â””â”€â”€ migrations/              # Drizzle migrations + raw SQL
â”œâ”€â”€ .github/workflows/
â”‚   â”œâ”€â”€ ci.yml                   # fork-safe PR verification and image scan
â”‚   â”œâ”€â”€ release-image.yml         # sole build, scan, and immutable digest approval
â”‚   â”œâ”€â”€ deploy.yml                # approved-digest release and coordinated edge cutover
â”‚   â”œâ”€â”€ data-migration.yml       # manual non-destructive legacy staging
â”‚   â””â”€â”€ legal-audit.yml          # immutable legal-version recording
â”œâ”€â”€ drizzle.config.ts, vite.config.ts, package.json, tsconfig.json, ...
```

Vite path aliases: `@/*` â†’ `src/client/src/*`, `@shared/*` â†’ `src/shared/*`,
`@backend/*` â†’ `src/backend/*`.

## Features

### Public pages
- **Home (`/`)** â€” 3D business card, animated "FULL STACK ENGINEER" hero,
  skills constellation, first-visit intro animation gated by localStorage
- **Portfolio (`/portfolio`)** â€” cube-style paginated project cards;
  per-project chat at `/portfolio/:projectId/chat` powered by the AI agent
- **Tree (`/tree`)** â€” carousel of "linktree"-style cards
- **About (`/about`)** â€” bio card + experience timeline
- **Activity (`/activity`)** â€” unified feed of GitHub activity + LinkedIn
  posts/reposts/articles, with cached ingestion in the backend
- **Legal (`/privacy`, `/terms`, `/tracking`)** â€” Markdown rendered from
  `legal/*.md` via the backend, with a side TOC layout

### Cross-cutting UX
- **Consent banner** â€” clickwrap with jurisdiction detection, hidden on
  legal pages, respects browser-level Global Privacy Control
- **LogRocket bridge** â€” only attaches identifying data after consent
- **US-only geoblocking** â€” `ENFORCE_US_ONLY=true` returns HTTP 451 outside
  the US; localhost/private IPs always allowed; static assets exempt

### Admin (`/admin`, Google OAuth)
- Portfolio-local bio, project presentation, skill grouping/selection,
  AI-model registry, and welcome-message administration with audit logging
- Admin policy-acceptance modal records the binding version of legal docs
  the admin agreed to

Admin Dashboard is the sole human identity and canonical career-data authority.
Portfolio's Cloudflare edge and origin both accept only Admin's 15-minute RS256 identity through its public JWKS;
HS256 compatibility is rejected. Legacy Portfolio admin routes may edit
Portfolio-owned presentation fields and local display order, but return
`CANONICAL_CAREER_READ_ONLY` for canonical profile, project, experience, and
skill mutations. Admin's authenticated Pub/Sub push subscription projects
Admin-owned public career data into Portfolio's local read model at
`POST /internal/pubsub/career`.

The push route verifies a Google RS256 OIDC token for one exact audience and
service-account email before parsing the request body. It also requires the exact
production subscription, standard wrapped Pub/Sub envelope, v1 attributes, and an
ordering key equal to `aggregate_id`. Inbox claiming, SHA-256 digest comparison,
aggregate-version enforcement, projection, and checkpointing run in one PostgreSQL
transaction. A duplicate ID with the same digest is acknowledged as a no-op; a
different digest is recorded in `career_event_quarantine` and acknowledged. Version
gaps, stale versions, and transient failures return non-2xx so Pub/Sub can retry or
dead-letter them. See
`C:\Users\matth\OneDrive\Desktop\programs\personal_brand\services\portfolio\docs\pubsub-career-consumer.md`.

### AI project chat
- Per-project system prompt; tools include `ProjectContextTool`,
  `GitHubRepoTool`, `GitHubFileTreeTool`, `GitHubReadFileTool`,
  `GitHubCommitsTool`, `GitHubIssuestool`
- Output evaluator with up-to-N rewrite attempts; mermaid diagrams are
  validated before sending
- Provider fallback: Gradient â†’ Fireworks with a per-model 1-hour
  rate-limit cooldown

### Legal-document VCS
- Files in `/legal/` are the source of truth; the frontend pulls them via
  `/api/legal/*`
- Every protected-main release calls the exact-SHA `Legal Audit` workflow before
  database or traffic mutation. It records sha256-deduped rows in Supabase
  `legal_document_versions`. The `legal_document_active_ranges` view
  computes `effective_until` per `doc_type` so you can ask "which version
  was binding at time T?" forever. Missing WIF, bundle, role, table, TLS, or
  insert availability blocks the release
- See `legal/README.md` for the query/rollback procedure

## Development

### Prerequisites
- Node 22+, npm
- An isolated non-production Supabase development database
- An Admin Dashboard RS256 test identity or mocked auth adapter for protected-route development

### First-time setup
```bash
npm ci
cp .env.example .env       # set DATABASE_URL and SUPABASE_CA_CERT_PATH for the development project
npm run db:migrate         # apply every committed migration
```

Localhost Postgres is reserved for automated integration tests. CI starts a
disposable `pgvector/Postgres` service, applies every migration, runs the tests,
and destroys it. Development uses an isolated non-production Supabase database.
Production bundles reject localhost, loopback, IP, private, `.local`, arbitrary
Postgres, cross-project Supabase, and privileged-role URLs. They require the exact
`SUPABASE_PROJECT_REF`, a parseable Supabase CA, and hostname-verified TLS.

### Run in dev
```bash
npm run dev
```

This starts the Express server on `PORT` (default 3000) with `tsx watch`.
The server mounts Vite as middleware in development, so the frontend is
served at the same origin â€” open <http://localhost:3000>.

If you want to run only the frontend against an already-running backend on
port 3000:
```bash
npm run dev:client   # Vite on port 5000 with /api + /auth proxied to :3000
```

### Other dev scripts
| Command | What it does |
|---|---|
| `npm run check` | TypeScript type-check (no emit) |
| `npm run lint` | ESLint over the repo |
| `npm run test:ui` | Playwright assertions against the running dev server |
| `npm run test:backend-unit` | Secretless backend unit and policy tests |
| `npm run test:backend-integration` | Database integration tests against `TEST_DATABASE_URL` |
| `npm run test:coverage` | Enforce 70% lines, branches, functions, and statements |
| `npm run test:pictures` | Generate viewport screenshots for visual review |
| `npm run test:pictures:verify` | Verify expected screenshots exist |
| `npm run db:migrate` | Apply every committed migration to the configured database |
| `npm run db:migrate-legacy-data` | Stage the frozen legacy bridge into an empty private schema; never a cutover or source deletion |
| `npm run legal:record` | Manually run the legal-audit recorder (normally run by CI) |

## Production

### Build
```bash
npm run build
```

`src/scripts/build.ts` does two things:
1. `vite build` â†’ emits the SPA to `dist/public/`
2. `esbuild` bundles the server into `dist/index.cjs` and the immutable-image
   migration entry point into `dist/migrate.cjs` (CJS,
   minified, with an allowlist of deps bundled inline to reduce cold-start
   syscalls; the rest are kept external and resolved from `node_modules`)

### Start
```bash
npm start
```

Runs `dist/index.cjs` through the pinned distroless Node 22 entrypoint with
`NODE_ENV=production`. In production mode
the server calls `serveStatic(app)` (from `src/backend/static.ts`) instead
of mounting Vite, serving `dist/public/` with an SPA fallback to
`index.html`.

The container ships `dist/`, production `node_modules/`, `package.json`,
`legal/`, and `migrations/` (the backend reads markdown
from there at request time).

### Required env vars
Cloud Run injects the schema-validated JSON bundle as one pinned Secret Manager
environment reference:
```
NODE_ENV=production
PORT=8080
PUBLIC_BASE_URL=https://2jog.dev
PORTFOLIO_RUNTIME_BUNDLE=<portfolio-runtime-bundle-prod JSON>
CAREER_PUBSUB_PUSH_AUDIENCE=https://<stable-cloud-run-origin>/internal/pubsub/career
CAREER_PUBSUB_PUSH_SERVICE_ACCOUNT=<portfolio-push-identity>@personal-brand-501801.iam.gserviceaccount.com
CAREER_PUBSUB_SUBSCRIPTION=projects/personal-brand-501801/subscriptions/<portfolio-career-subscription>
```

The runtime bundle maps `PORTFOLIO_RUNTIME_DATABASE_URL` to the process
`DATABASE_URL`; that URL must authenticate as `portfolio_runtime`. Startup
then verifies `session_user`, `current_user`, inherited role attributes,
database CREATE, and public-schema CREATE before the server listens. The bundle also
supplies Admin RS256/JWKS, inference, `SUPABASE_PROJECT_REF`, the Supabase CA,
and `EDGE_ORIGIN_TOKEN`. It intentionally excludes Google OAuth, session, and
paid ingestion credentials because those integrations are not active in the
target production runtime. The three Pub/Sub values above are nonsecret topology
and identity allowlists, not secret-bundle fields. Cloudflare receives the same
credential as `ORIGIN_ACCESS_TOKEN` from the deployment bundle and overwrites
any client-supplied origin header before proxying. Direct `run.app` requests
without the exact credential return HTTP 401. The sole exception is the internal
career push path, which mounts before the Cloudflare gate and independently requires
the exact Google OIDC identity. The self-contained contract is
`C:\Users\matth\OneDrive\Desktop\programs\personal_brand\services\portfolio\config\secret-schema.prod.json`.
Infisical remains the human-edited authority; production
does not fetch Infisical directly. The raw runtime JSON environment value is removed
immediately after parsing. Local development uses a service-local `.env`
created from `.env.example`; it never reads the root union environment file.

### CI/CD

`C:\Users\matth\OneDrive\Desktop\programs\personal_brand\services\portfolio\CI_SETUP.md`
is the operational source for fork-safe `main` PR CI, repository-bound WIF,
the dedicated Artifact Registry, a release-image run handoff that is verified by exact SHA and retained artifact before a digest-pinned zero-traffic candidate,
custom/raw smoke checks, ten-minute observation, and causal rollback. Cloud Build
and the legacy shared deployment identity/repository are not part of delivery.
The checked-in `portfolio-edge` Worker owns `2jog.dev` and `www.2jog.dev`; its
deployment is coordinated with Cloud Run because both sides share the origin
credential. The previous route owners and Worker version are retained in a
30-day GitHub artifact together with the exact Cloud Run traffic/tag and IAM
snapshots and origin-token fingerprints. Manual cleanup is legal-gated and
requires both 48 elapsed hours and a distinct later successful release.

## Testing

Tests live under `src/tests/`:

- `src/tests/ui-test/` â€” Playwright functional assertions (consent
  recording, etc.). `npm run test:ui` runs these against a Vite dev server
  it spawns on `127.0.0.1:5000`. Add `-- --headed` for headed execution and
  set `PLAYWRIGHT_SLOW_MO_MS` to add a human-viewable delay between actions.
  Two workers run by default to keep cold Vite startup reliable; override
  that with `PLAYWRIGHT_WORKERS` when the host has additional capacity.
- `src/tests/ui-artifacts/` â€” Playwright viewport screenshots at desktop
  (1440Ã—900) and mobile (390Ã—844). Output goes to
  `src/tests/ui-artifacts/{desktop,mobile}/` (gitignored except
  `.gitkeep`). `npm run test:pictures` to regenerate.
- `src/tests/backend-unit/` â€” secretless Node `node:test` suite covering core
  behavior and delivery policy. `npm run test:backend-unit`.
- `src/tests/backend-integration/` â€” database connectivity/schema checks against
  an isolated pgvector/Postgres database. `npm run test:backend-integration`.

## Database

Drizzle schema lives in `src/shared/schema.ts` and `src/shared/schema_policy.ts`.
Tables include: `users`, `projects`, `xyz_bullets`, `bio`, `bio_paragraphs`,
`personal_information`, `experiences`, `all_skills` (+ embeddings),
`portfolio_skills`, `skills_group`, `ai_models`, `audit_logs`,
`linkedin_timeline_events`, `github_timeline_events`,
`admin_policy_acceptance`, and `legal_document_versions`.

Migrations are in `src/migrations/`. CI applies them to disposable Postgres; CD
first completes the immutable-SHA legal audit and finalized cutover-evidence
gates, consumes only the successful release-image workflow artifact for the exact current SHA, proves that the pulled service-owned image digest carries the current
source revision, and only then runs reviewed production migrations from that
digest before the zero-traffic candidate deploy. The privileged deploy workflow does not start
localhost Postgres or repeat database integration tests; those are required in PR CI.
Its deployment bundle carries `MIGRATION_DATABASE_URL` from
`PORTFOLIO_MIGRATION_DATABASE_URL`; only the digest-pinned migration child
receives it as `DATABASE_URL`. The migrator applies every private-schema DDL
from its own checksum ledger; the legacy `public` Drizzle ledger is never
adopted. The legal bundle separately carries
`LEGAL_AUDIT_DATABASE_URL` from `PORTFOLIO_LEGAL_AUDIT_DATABASE_URL`,
authenticating as `legal_audit_writer`. Raw bundle files are mode 0600 and
deleted immediately after each parser reads them. A fourth one-time bundle and
manual `data-migration.yml` workflow isolate the legacy reader from the target
migrator, require the requested digest to equal repository variable
`PORTFOLIO_DATA_MIGRATION_IMAGE_DIGEST`, and upload source-retaining count/hash
evidence. Finalization fetches an RS256 JWS from Admin through Google OIDC and
verifies the signature plus exact release SHA, image digest, migration-ledger
digest, snapshot/checkpoint, and reviewed 23-table ownership-manifest digest;
operator-supplied evidence is rejected. The workflow runs that immutable image read-only, drops every Linux
capability, enables `no-new-privileges`, and applies bounded process, memory,
CPU, and temporary-filesystem limits.

The historical `0000` through `0014` files are one checksum-bound
`empty-target-only` batch. Production accepts that batch only when the private
Portfolio schema has no object, default privilege, or ledger state; every
nonempty partial prefix fails before SQL executes. A complete ledger is a no-op.
Every future migration requires a checksum-bound reviewed classification.
Unknown classifications fail closed; `data-repair` requires a separate path with
explicit expected counts, hashes, and a maximum threshold.

The private ledger is not sufficient evidence by itself. On every run, the
migrator replays the accepted checksum prefix into a transaction-local temporary
schema and compares deterministic catalog evidence for schema ownership;
relation persistence, partitions, foreign options, and tablespaces; dropped and
live column slots; defaults; indexes; constraints; routines; standalone and
composite types; policies; triggers; rules; extensions; operators and operator
families/classes; collations; conversions; text-search objects; statistics; and
object owners. ACL/default-privilege evidence is verified separately against the
fixed role contract. The migrator verifies again after applying new DDL, then discards the temporary
schema before commit. PostgreSQL's catalog remains implicitly first; no migration
path explicitly places `pg_catalog` after a writable schema.

Connected-session checks enforce the database boundary rather than trusting a
URL or role name. Privilege-free direct logins are verified before `SET ROLE`
selects a NOLOGIN capability, and post-reconciliation checks run again after
`RESET ROLE`. They reconcile direct-login, cross-schema, `PUBLIC`, database,
schema, table, sequence, column, type, `ALL ROUTINES`, ownership, inherited-role,
and default-privilege access exactly. `portfolio_runtime` and `portfolio_migrator` may inherit the
shared project's harmless `public` schema `USAGE`, but they cannot read or
write any public relation, sequence, column, or function; create or own public
objects; or access a sibling service schema. The target reconciler also removes
every non-owner grant from Portfolio objects before rebuilding the exact
runtime/legal matrix; inaccessible sibling-schema `PUBLIC` defaults do not
become false positives without schema `USAGE`. Both require `extensions` `USAGE`
without `CREATE`; `vector` and its type must be in `extensions` and owned by
`postgres`. The migrator alone requires database `TEMPORARY` for its expected
schema proof. The source-only
`portfolio_legacy_reader` has `SELECT` on exactly the 23 allowlisted base or
partitioned tables with `search_path=public`. The sole RLS exception is
`public.legal_document_versions`, which must have exactly one applicable
permissive `SELECT` policy named `portfolio_legacy_reader_full_read`, scoped only
to the reader with `USING (true)` and no `WITH CHECK`; unrelated writer-only
policies may remain. Every other allowlisted table has RLS disabled. The reader
has no column writes, unexpected public relations or sequences, executable public
functions, object ownership, DDL, administrative membership, or sibling-schema
access. Apply the source-side contract at
`C:\Users\matth\OneDrive\Desktop\programs\personal_brand\services\portfolio\infra\supabase\legacy-reader.sql`
with the legacy project administrator; it never
creates or changes a password.

Migration `0016_database_audit_compensation.sql` expands auditing additively for
the deployed `37abdbd7a15f` baseline. Legacy writes without explicit context are
temporarily labeled `pre-audit-37abdbd7a15f`; the first successful audited
release starts the grace clock, and strict rejection is enabled only after 48
hours and a distinct later successful release.

`src/scripts/legacy-data-migration.ts` is a classified bridge inventory, not an
ownership declaration. It separates Portfolio-owned, Admin projection, and hybrid
tables, excludes Resume/control-plane storage, ignores the legacy
`skills_group.discipline_id` dependency, and preserves the source. Its bootstrap
result is staged with `cutoverReady: false`. Owned rows still require a write
fence/final hash; projected and hybrid rows require an Admin snapshot and durable
event checkpoint. Admin evidence proves only canonical career-data authority and
zero event-version gaps; Resume Studio proves its separate schema cutover in its
own release and is never a Portfolio release prerequisite. The one-time bootstrap
retries only recognized transient Supabase pooler connection failures, with six
15-second attempts and fixed five-second delays; authentication, TLS, role, and
contract errors fail immediately. The frozen source column inventory is
`src/tests/fixtures/legacy-portfolio-schema.ts`. Resume and Portfolio rollback
windows complete before any public compatibility object is retired. The `vector`
extension is provisioned only in `extensions`; Portfolio has no embedding or
clustering mutation script.

## Runtime ownership

Public browsers and mail clients call `https://2jog.dev` and
`https://www.2jog.dev`. Portfolio calls Admin's JWKS/public career contracts,
Supabase PostgreSQL, and optional inference providers. LinkedIn reads persisted
SQL activity without a provider call; the runtime contains no paid synchronization
client, activation switch, or provider credential. Pub/Sub is the only asynchronous
runtime transport; no long-lived broker consumer or broker credential remains.
Reintroducing paid synchronization requires a reviewed implementation, secret schema,
consumer tests, and cost-policy change. It runs as
`portfolio--prod` in Cloud
Run `us-east4`; any public request scales it from zero, with one maximum instance,
one CPU, 512 MiB memory, and request-based CPU. Rollback moves traffic to the
retained prior revision; it never rebuilds or invokes Cloud Build.
