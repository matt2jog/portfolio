const EXPECTED_REPOSITORY = "matt2jog/portfolio";
const EXPECTED_REF = "refs/heads/main";
export const DEPLOY_WORKFLOW_REF = "matt2jog/portfolio/.github/workflows/deploy.yml@refs/heads/main";
export const LEGAL_AUDIT_WORKFLOW_REF = "matt2jog/portfolio/.github/workflows/legal-audit.yml@refs/heads/main";
export const DATA_MIGRATION_WORKFLOW_REF = "matt2jog/portfolio/.github/workflows/data-migration.yml@refs/heads/main";
export const RELEASE_CLEANUP_WORKFLOW_REF = "matt2jog/portfolio/.github/workflows/release-cleanup.yml@refs/heads/main";
export const DATABASE_BOOTSTRAP_WORKFLOW_REF = "matt2jog/portfolio/.github/workflows/database-bootstrap.yml@refs/heads/main";

export function isExpectedPortfolioActionsMain(
  env: NodeJS.ProcessEnv = process.env,
  allowedWorkflowRefs: readonly string[] = [DEPLOY_WORKFLOW_REF],
): boolean {
  const releaseSha = env.GITHUB_SHA ?? "";
  const workflowSha = env.GITHUB_WORKFLOW_SHA ?? "";
  return env.GITHUB_ACTIONS === "true"
    && env.GITHUB_REPOSITORY === EXPECTED_REPOSITORY
    && env.GITHUB_REF === EXPECTED_REF
    && allowedWorkflowRefs.includes(env.GITHUB_WORKFLOW_REF ?? "")
    && /^[a-f0-9]{40}$/.test(releaseSha)
    && workflowSha === releaseSha;
}

export function assertProductionMutationAllowed(
  env: NodeJS.ProcessEnv = process.env,
  operation = "Production mutation",
  allowedWorkflowRefs: readonly string[] = [DEPLOY_WORKFLOW_REF],
): void {
  if (isExpectedPortfolioActionsMain(env, allowedWorkflowRefs)) return;

  throw new Error(
    `${operation} is disabled outside GitHub Actions ${EXPECTED_REPOSITORY} ${EXPECTED_REF}, an allowed direct workflow, and an exact current workflow SHA`,
  );
}
