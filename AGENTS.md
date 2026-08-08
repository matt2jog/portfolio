# Portfolio service agent guide

Read the workspace rules at `../../AGENTS.md` before working here. This
repository owns Portfolio runtime code, Portfolio-owned migrations, tests, its
image, and GitHub workflows. The parent workspace owns its infrastructure at
`../../infra/terraform/services/portfolio/` and shared resources at
`../../infra/terraform/`.

If the parent checkout is unavailable, read the
[workspace rules](https://github.com/matt2jog/personal_brand_workspace/blob/main/AGENTS.md)
and [Portfolio Terraform source](https://github.com/matt2jog/personal_brand_workspace/tree/main/infra/terraform/services/portfolio)
before changing a platform boundary.

## Work from owning sources

- Runtime and UI behavior: `src/`
- Portfolio-owned persistence changes: the owning service store, never the
  Admin-owned career migration
- Build and verification commands: `package.json` and `.github/workflows/ci.yml`
- Promotion behavior: `.github/workflows/promote.yml`
- Runtime contract names: `.env.example` and actual configuration consumers
- Navigation: `wiki/Home.md`

Inspect parent Terraform, state, and live resources before changing a runtime
identity, endpoint, provider, database/storage target, analytics dependency, or
secret consumer. Read parent files freely; edit them only when the task includes
that shared concern and ownership is coordinated.

Canonical career data is read-only in Portfolio. Portfolio must not update or
delete it and may write only Portfolio-owned data. Full career CRUD goes through
Admin. Admin also owns the career migration and one-time provider transfer;
Portfolio must not ship a career migration runner or transfer gate. Preserve
production Portfolio data.

Do not add event sourcing, application Pub/Sub, message-broker abstractions,
Cloudflare Workers, global agent configuration, or parallel catalogs. Never
expose secret values, visitor identifiers, authorization/session data, or
private activity payloads.

Before provisioning or expanding a metered resource, present direct monthly and
upper-bound estimates plus consequences and obtain explicit human approval. Use
the workspace Communications email skill when the owner is away.

Preserve unrelated dirty changes. Run the applicable package, migration,
backend/client, image, browser, activity-provider, authorization, and canonical
host checks. Do not claim a deployment or migration succeeded without observing
it.
