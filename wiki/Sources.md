# Portfolio source map

| Concern | Owning source |
|---|---|
| Runtime, UI, and routes | [`src/`](https://github.com/matt2jog/portfolio/tree/main/src) |
| Canonical career schema | [Admin career migrations](https://github.com/matt2jog/admin_dashboard/tree/main/migrations/career) |
| One-time career transfer | [Admin transfer script](https://github.com/matt2jog/admin_dashboard/blob/main/src/scripts/transferCareerData.ts) |
| Portfolio read-model contract tests | [`src/tests/fixtures/`](https://github.com/matt2jog/portfolio/tree/main/src/tests/fixtures) |
| Dependencies and commands | [`package.json`](https://github.com/matt2jog/portfolio/blob/main/package.json) |
| Verification and image build | [`.github/workflows/ci.yml`](https://github.com/matt2jog/portfolio/blob/main/.github/workflows/ci.yml) |
| Production promotion | [`.github/workflows/promote.yml`](https://github.com/matt2jog/portfolio/blob/main/.github/workflows/promote.yml) |
| Portfolio infrastructure | [`infra/terraform/services/portfolio`](https://github.com/matt2jog/personal_brand_workspace/tree/main/infra/terraform/services/portfolio) |
| Shared infrastructure | [`infra/terraform`](https://github.com/matt2jog/personal_brand_workspace/tree/main/infra/terraform) |
| Release standard | [`CI_CD.md`](https://github.com/matt2jog/personal_brand_workspace/blob/main/CI_CD.md) |

Use live provider state and refreshed Terraform plans for deployed reality.
