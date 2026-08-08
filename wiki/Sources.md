# Portfolio source map

| Concern | Owning source |
|---|---|
| Runtime, UI, and routes | [`src/`](../src/) |
| Canonical career schema | [Admin career migrations](../../admin_dashboard/migrations/career/) |
| Career transfer owner | [Admin transfer script](../../admin_dashboard/src/scripts/transferCareerData.ts) |
| Portfolio read-model fixtures | [`src/tests/fixtures/`](../src/tests/fixtures/) |
| Dependencies and commands | [`package.json`](../package.json) |
| Verification and image build | [`ci.yml`](../.github/workflows/ci.yml) |
| Production promotion | [`promote.yml`](../.github/workflows/promote.yml) |
| Portfolio infrastructure, when parent exists | [`infra/terraform/services/portfolio`](../../../infra/terraform/services/portfolio/) |
| Shared infrastructure, when parent exists | [`infra/terraform`](../../../infra/terraform/) |
| Release standard, when parent exists | [`CI_CD.md`](../../../CI_CD.md) |

When Admin or the workspace is absent, use the
[Admin repository](https://github.com/matt2jog/admin_dashboard) and
[workspace repository](https://github.com/matt2jog/personal_brand_workspace) as
remote entry points. Use live state and refreshed plans for deployed reality.
