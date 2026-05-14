# 2jog.dev — personal brand portfolio

A full-stack personal-brand portfolio site. Single deployable: an Express
backend on port 3000 that serves API routes, runs the Vite dev server in
development, and serves the prebuilt SPA in production.

- Frontend: React 19 + Vite + Tailwind v4 + Wouter routing + TanStack Query
  + Three.js / R3F + GSAP + Framer Motion
- Backend: Express 5 + Drizzle ORM + Supabase Postgres + Passport
  (Google OAuth + local) + connect-pg-simple sessions
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
│   ├── ui-tests.yml             # lint + typecheck + Playwright on PRs
│   └── legal-audit.yml          # records legal-doc versions to Supabase
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
- Bio, projects, skills (with groups), AI-model registry, personal info,
  experiences — full CRUD with audit logging
- Admin policy-acceptance modal records the binding version of legal docs
  the admin agreed to

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
- On every push to `prod` that touches `legal/**.md`, the `Legal Audit`
  workflow records sha256-deduped rows in Supabase
  `legal_document_versions`. The `legal_document_active_ranges` view
  computes `effective_until` per `doc_type` so you can ask "which version
  was binding at time T?" forever
- See `legal/README.md` for the query/rollback procedure

## Development

### Prerequisites
- Node 22+, npm
- A Supabase Postgres database (or any Postgres with `pgvector`)
- A Google OAuth client (for admin login)

### First-time setup
```bash
npm ci
cp .env.example .env       # then fill in DATABASE_URL, OAuth creds, etc.
npm run db:push            # apply Drizzle schema to your database
```

Then apply the raw SQL migrations that drizzle-kit doesn't manage
(constraints, views, RLS policies) via the Supabase SQL editor — at minimum
`src/migrations/0005_legal_document_versions.sql`.

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
| `npm run test:ui-pictures` | Generate viewport screenshots for visual review |
| `npm run test:ui-pictures:verify` | Verify expected screenshots exist |
| `npm run db:push` | Drizzle-kit push (schema → DB) |
| `npm run skills:cluster` | Re-cluster skill embeddings and update groups |
| `npm run legal:record` | Manually run the legal-audit recorder (normally run by CI) |

## Production

### Build
```bash
npm run build
```

`src/scripts/build.ts` does two things:
1. `vite build` → emits the SPA to `dist/public/`
2. `esbuild` bundles `src/backend/index.ts` into `dist/index.cjs` (CJS,
   minified, with an allowlist of deps bundled inline to reduce cold-start
   syscalls; the rest are kept external and resolved from `node_modules`)

### Start
```bash
npm start
```

Runs `node dist/index.cjs` with `NODE_ENV=production`. In production mode
the server calls `serveStatic(app)` (from `src/backend/static.ts`) instead
of mounting Vite, serving `dist/public/` with an SPA fallback to
`index.html`.

The container needs to ship: `dist/`, `node_modules/` (for externals),
`package.json`, and the `/legal/` directory (the backend reads markdown
from there at request time).

### Required env vars
At minimum:
```
NODE_ENV=production
PORT=3000
DATABASE_URL=postgres://...
SESSION_SECRET=<strong random>
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
CALLBACK_URL=https://<your-domain>/auth/google/callback
```

Optional: `ENFORCE_US_ONLY`, `ALLOWED_ADMIN_EMAIL`, `ALLOWED_ADMIN_SUB`,
LinkedIn ingestion (`LINKEDIN_*`, `APIFY_*`), AI providers
(`GRADIENT_AI_TOKEN`, `FIREWORKS_AI_TOKEN`), Supabase TLS
(`SUPABASE_CA_CERT_PATH` or `SUPABASE_CA_CERT`).
See `.env.example` for the full list.

### CI/CD
- **`ui-tests.yml`** — runs lint + typecheck + Playwright assertions +
  viewport screenshots on every PR and on push to `main`. Uploads
  screenshots as an artifact.
- **`legal-audit.yml`** — runs on push to `prod` when any `legal/**.md`
  changes. Computes the commit timestamp and inserts an audit row per doc
  (idempotent via `unique(doc_type, content_hash)`). Retries 3× with
  exponential backoff; fails the workflow loudly on persistent failure.
  Required GitHub secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`. Make this
  workflow a required status check on `prod` so legal changes can't merge
  without a successful audit record.

## Testing

Playwright lives under `src/tests/`. Two configs:
- `src/tests/github-actions/playwright.config.ts` — functional assertions
  (consent recording, etc.). `npm run test:ui` runs these against a Vite
  dev server it spawns on `127.0.0.1:5000`.
- `src/tests/viewport-human-judge/playwright.config.ts` — viewport
  screenshots at desktop (1440×900) and mobile (390×844). Output goes to
  `src/tests/viewport-human-judge/{desktop,mobile}/`. Both folders are
  gitignored except for `.gitkeep`.

## Database

Drizzle schema lives in `src/shared/schema.ts` and `src/shared/schema_policy.ts`.
Tables include: `users`, `projects`, `xyz_bullets`, `bio`, `bio_paragraphs`,
`personal_information`, `experiences`, `all_skills` (+ embeddings),
`portfolio_skills`, `skills_group`, `ai_models`, `audit_logs`,
`linkedin_timeline_events`, `github_timeline_events`,
`admin_policy_acceptance`, and `legal_document_versions`.

Migrations are in `src/migrations/`. Drizzle-managed ones use the
`drizzle-kit` journal; raw SQL files (constraints, views, RLS) are applied
manually via the Supabase SQL editor.
