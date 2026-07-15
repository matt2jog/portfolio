# 2jog.dev — personal brand portfolio

A full-stack personal-brand portfolio site. Single deployable: an Express
backend on port 3000 that serves API routes, runs the Vite dev server in
development, and serves the prebuilt SPA in production.

- Frontend: React 19 + Vite + Tailwind v4 + Wouter routing + TanStack Query
  + Three.js / R3F + GSAP + Framer Motion
- Backend: Express 5 + Drizzle ORM + Supabase Postgres + strict Admin Dashboard
  RS256/JWKS identity consumption
- AI: pluggable LLM provider stack (Gradient primary, Fireworks fallback)
  driving the project-chat agent with tool use and an output evaluator
- Observability/compliance: GeoIP-gated US-only access, consent clickwrap,
  LogRocket session capture (post-consent only), append-only Supabase audit
  log for legal-document versions

## Repository layout

```
portfolio/
├── legal/                       # source of truth for binding legal docs
│   ├── PRIVACY_POLICY.md
│   ├── TERMS_OF_USE.md
│   ├── TRACKING_NOTICE_AND_CONSENT.md
│   └── README.md                # audit-log + workflow docs
├── src/
│   ├── client/                  # Vite + React SPA (index.html, src/)
│   ├── backend/                 # Express server, agent, auth, integrations
│   │   ├── data/db.ts           # Drizzle + pg pool
│   │   └── agent/               # LLM provider, tools, rules, evaluator
│   ├── scripts/                 # build, seeders, skill clustering, legal recorder
│   ├── shared/                  # Drizzle schema, types reused by both sides
│   ├── tests/                   # Playwright: assertions + viewport screenshots
│   └── migrations/              # Drizzle migrations + raw SQL
├── .github/workflows/
│   ├── ci.yml                   # fork-safe PR verification and image scan
│   ├── deploy.yml               # merge-SHA image release and coordinated edge cutover
│   └── legal-audit.yml          # immutable legal-doc audit recording
├── drizzle.config.ts, vite.config.ts, package.json, tsconfig.json, ...
```

Vite path aliases: `@/*` → `src/client/src/*`, `@shared/*` → `src/shared/*`,
`@backend/*` → `src/backend/*`.

## Features

### Public pages
- **Home (`/`)** — 3D business card, animated "FULL STACK ENGINEER" hero,
  skills constellation, first-visit intro animation gated by localStorage
- **Portfolio (`/portfolio`)** — cube-style paginated project cards;
  per-project chat at `/portfolio/:projectId/chat` powered by the AI agent
- **Tree (`/tree`)** — carousel of "linktree"-style cards
- **About (`/about`)** — bio card + experience timeline
- **Activity (`/activity`)** — unified feed of GitHub activity + LinkedIn
  posts/reposts/articles, with cached ingestion in the backend
- **Legal (`/privacy`, `/terms`, `/tracking`)** — Markdown rendered from
  `legal/*.md` via the backend, with a side TOC layout

### Cross-cutting UX
- **Consent banner** — clickwrap with jurisdiction detection, hidden on
  legal pages, respects browser-level Global Privacy Control
- **LogRocket bridge** — only attaches identifying data after consent
- **US-only geoblocking** — `ENFORCE_US_ONLY=true` returns HTTP 451 outside
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
skill mutations. The disabled compatibility consumer projects Admin-owned
public career data into Portfolio's local read model.

### AI project chat
- Per-project system prompt; tools include `ProjectContextTool`,
  `GitHubRepoTool`, `GitHubFileTreeTool`, `GitHubReadFileTool`,
  `GitHubCommitsTool`, `GitHubIssuestool`
- Output evaluator with up-to-N rewrite attempts; mermaid diagrams are
  validated before sending
- Provider fallback: Gradient → Fireworks with a per-model 1-hour
  rate-limit cooldown

### Legal-document VCS
- Files in `/legal/` are the source of truth; the frontend pulls them via
  `/api/legal/*`
- On every push to protected `main` that touches `legal/**.md`, the `Legal Audit`
  workflow records sha256-deduped rows in Supabase
  `legal_document_versions`. The `legal_document_active_ranges` view
  computes `effective_until` per `doc_type` so you can ask "which version
  was binding at time T?" forever
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
served at the same origin — open <http://localhost:3000>.

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
| `npm run skills:cluster` | Re-cluster skill embeddings and update groups |
| `npm run legal:record` | Manually run the legal-audit recorder (normally run by CI) |

## Production

### Build
```bash
npm run build
```

`src/scripts/build.ts` does two things:
1. `vite build` → emits the SPA to `dist/public/`
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
```

The runtime bundle maps `PORTFOLIO_RUNTIME_DATABASE_URL` to the process
`DATABASE_URL`; that URL must authenticate as `portfolio_runtime`. Startup
then verifies `session_user`, `current_user`, inherited role attributes,
database CREATE, and public-schema CREATE before the server listens. The bundle also
supplies Admin RS256/JWKS, inference, `SUPABASE_PROJECT_REF`, the Supabase CA,
and `EDGE_ORIGIN_TOKEN`. It intentionally excludes Google OAuth,
Kafka, session, and paid ingestion credentials because those integrations are
not active in the target production runtime. Cloudflare receives the same
credential as `ORIGIN_ACCESS_TOKEN` from the deployment bundle and overwrites
any client-supplied origin header before proxying. Direct `run.app` requests
without the exact credential return HTTP 401. The self-contained contract is
`C:\Users\matth\OneDrive\Desktop\programs\personal_brand\services\portfolio\config\secret-schema.prod.json`.
Infisical remains the human-edited authority; production
does not fetch Infisical directly. The raw runtime JSON environment value is removed
immediately after parsing. Local development uses a service-local `.env`
created from `.env.example`; it never reads the root union environment file.

### CI/CD

`C:\Users\matth\OneDrive\Desktop\programs\personal_brand\services\portfolio\CI_SETUP.md`
is the operational source for fork-safe `main` PR CI, repository-bound WIF,
the dedicated Artifact Registry, digest-pinned zero-traffic candidates,
custom/raw smoke checks, ten-minute observation, and causal rollback. Cloud Build
and the legacy shared deployment identity/repository are not part of delivery.
The checked-in `portfolio-edge` Worker owns `2jog.dev` and `www.2jog.dev`; its
deployment is coordinated with Cloud Run because both sides share the origin
credential. The previous route owners and Worker version are retained in a
three-day GitHub artifact so the required 48-hour rollback window is reproducible.

## Testing

Tests live under `src/tests/`:

- `src/tests/ui-test/` — Playwright functional assertions (consent
  recording, etc.). `npm run test:ui` runs these against a Vite dev server
  it spawns on `127.0.0.1:5000`. Add `-- --headed` for headed execution and
  set `PLAYWRIGHT_SLOW_MO_MS` to add a human-viewable delay between actions.
  Two workers run by default to keep cold Vite startup reliable; override
  that with `PLAYWRIGHT_WORKERS` when the host has additional capacity.
- `src/tests/ui-artifacts/` — Playwright viewport screenshots at desktop
  (1440×900) and mobile (390×844). Output goes to
  `src/tests/ui-artifacts/{desktop,mobile}/` (gitignored except
  `.gitkeep`). `npm run test:pictures` to regenerate.
- `src/tests/backend-unit/` — secretless Node `node:test` suite covering core
  behavior and delivery policy. `npm run test:backend-unit`.
- `src/tests/backend-integration/` — database connectivity/schema checks against
  an isolated pgvector/Postgres database. `npm run test:backend-integration`.

## Database

Drizzle schema lives in `src/shared/schema.ts` and `src/shared/schema_policy.ts`.
Tables include: `users`, `projects`, `xyz_bullets`, `bio`, `bio_paragraphs`,
`personal_information`, `experiences`, `all_skills` (+ embeddings),
`portfolio_skills`, `skills_group`, `ai_models`, `audit_logs`,
`linkedin_timeline_events`, `github_timeline_events`,
`admin_policy_acceptance`, and `legal_document_versions`.

Migrations are in `src/migrations/`. CI applies them to disposable Postgres; CD
runs additive production migrations from the same scanned image digest before
the zero-traffic candidate deploy. The privileged deploy workflow does not start
localhost Postgres or repeat database integration tests; those are required in PR CI.
Its deployment bundle carries `MIGRATION_DATABASE_URL` from
`PORTFOLIO_MIGRATION_DATABASE_URL`; only the digest-pinned migration child
receives it as `DATABASE_URL`. The legal bundle separately carries
`LEGAL_AUDIT_DATABASE_URL` from `PORTFOLIO_LEGAL_AUDIT_DATABASE_URL`,
authenticating as `legal_audit_writer`. Raw bundle files are mode 0600 and
deleted immediately after each parser reads them.

## Runtime ownership

Public browsers and mail clients call `https://2jog.dev` and
`https://www.2jog.dev`. Portfolio calls Admin's JWKS/public career contracts,
Supabase PostgreSQL, and optional inference providers. LinkedIn reads persisted
SQL activity without a provider call; paid Apify synchronization defaults off
and requires `LINKEDIN_SYNC_ENABLED=1` locally. Kafka compatibility code also
defaults off and has no production credentials. Re-enabling either integration
requires a reviewed secret-schema and cost-policy change. It runs as
`portfolio--prod` in Cloud
Run `us-east4`; any public request scales it from zero, with one maximum instance,
one CPU, 512 MiB memory, and request-based CPU. Rollback moves traffic to the
retained prior revision; it never rebuilds or invokes Cloud Build.
