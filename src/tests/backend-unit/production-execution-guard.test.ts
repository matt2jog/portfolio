import assert from "node:assert/strict";
import test from "node:test";
import {
  assertProductionMutationAllowed,
  DATA_MIGRATION_WORKFLOW_REF,
  isExpectedPortfolioActionsMain,
  LEGAL_AUDIT_WORKFLOW_REF,
} from "../../scripts/production-execution-guard";

const expectedContext = {
  NODE_ENV: "production",
  GITHUB_ACTIONS: "true",
  GITHUB_REPOSITORY: "matt2jog/portfolio",
  GITHUB_REF: "refs/heads/main",
  GITHUB_WORKFLOW_REF: "matt2jog/portfolio/.github/workflows/deploy.yml@refs/heads/main",
  GITHUB_SHA: "a".repeat(40),
  GITHUB_WORKFLOW_SHA: "a".repeat(40),
};

test("production mutation context requires the Portfolio main GitHub Actions workflow", () => {
  assert.equal(isExpectedPortfolioActionsMain(expectedContext), true);
  assert.equal(isExpectedPortfolioActionsMain({ ...expectedContext, GITHUB_REPOSITORY: "fork/portfolio" }), false);
  assert.equal(isExpectedPortfolioActionsMain({ ...expectedContext, GITHUB_REF: "refs/heads/prod" }), false);
  assert.equal(
    isExpectedPortfolioActionsMain({
      ...expectedContext,
      GITHUB_WORKFLOW_REF: "matt2jog/portfolio/.github/workflows/ci.yml@refs/heads/main",
    }),
    false,
  );
  assert.equal(isExpectedPortfolioActionsMain({ ...expectedContext, GITHUB_ACTIONS: "false" }), false);
  assert.equal(isExpectedPortfolioActionsMain({ ...expectedContext, GITHUB_SHA: "short" }), false);
  assert.equal(
    isExpectedPortfolioActionsMain({ ...expectedContext, GITHUB_WORKFLOW_SHA: "b".repeat(40) }),
    false,
  );
});

test("legal audit identity is accepted only when explicitly requested", () => {
  const legalContext = { ...expectedContext, GITHUB_WORKFLOW_REF: LEGAL_AUDIT_WORKFLOW_REF };
  assert.equal(isExpectedPortfolioActionsMain(legalContext), false);
  assert.equal(isExpectedPortfolioActionsMain(legalContext, [LEGAL_AUDIT_WORKFLOW_REF]), true);
  assert.doesNotThrow(() =>
    assertProductionMutationAllowed(legalContext, "legal audit", [LEGAL_AUDIT_WORKFLOW_REF]),
  );
});

test("one-time data migration identity is accepted only when explicitly requested", () => {
  const migrationContext = { ...expectedContext, GITHUB_WORKFLOW_REF: DATA_MIGRATION_WORKFLOW_REF };
  assert.equal(isExpectedPortfolioActionsMain(migrationContext), false);
  assert.equal(isExpectedPortfolioActionsMain(migrationContext, [DATA_MIGRATION_WORKFLOW_REF]), true);
  assert.doesNotThrow(() =>
    assertProductionMutationAllowed(
      migrationContext,
      "legacy Portfolio data migration",
      [DATA_MIGRATION_WORKFLOW_REF],
    ),
  );
});

test("mutation guard fails closed when production markers are omitted", () => {
  assert.throws(() => assertProductionMutationAllowed({ NODE_ENV: "test" }, "test helper"), /workflow/i);
  assert.throws(() => assertProductionMutationAllowed({ NODE_ENV: "development" }, "dev helper"), /workflow/i);
  assert.throws(() => assertProductionMutationAllowed({}, "default helper"), /workflow/i);
});

test("production mutation guard rejects local and fork execution", () => {
  assert.throws(
    () => assertProductionMutationAllowed({ NODE_ENV: "production" }, "seed helper"),
    /seed helper.*matt2jog\/portfolio.*refs\/heads\/main/i,
  );
  assert.throws(
    () => assertProductionMutationAllowed({ ...expectedContext, GITHUB_REPOSITORY: "fork/portfolio" }, "migration helper"),
    /migration helper.*matt2jog\/portfolio/i,
  );
});
