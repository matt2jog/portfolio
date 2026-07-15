const EXPECTED_REPOSITORY = "matt2jog/portfolio";
const EXPECTED_REF = "refs/heads/main";
export const DEPLOY_WORKFLOW_REF = "matt2jog/portfolio/.github/workflows/deploy.yml@refs/heads/main";
export const LEGAL_AUDIT_WORKFLOW_REF = "matt2jog/portfolio/.github/workflows/legal-audit.yml@refs/heads/main";

export function isExpectedPortfolioActionsMain(
  env: NodeJS.ProcessEnv = process.env,
  allowedWorkflowRefs: readonly string[] = [DEPLOY_WORKFLOW_REF],
): boolean {
  return env.GITHUB_ACTIONS === "true"
    && env.GITHUB_REPOSITORY === EXPECTED_REPOSITORY
    && env.GITHUB_REF === EXPECTED_REF
    && allowedWorkflowRefs.includes(env.GITHUB_WORKFLOW_REF ?? "");
}

export function assertProductionMutationAllowed(
  env: NodeJS.ProcessEnv = process.env,
  operation = "Production mutation",
  allowedWorkflowRefs: readonly string[] = [DEPLOY_WORKFLOW_REF],
): void {
  if (env.NODE_ENV !== "production" || isExpectedPortfolioActionsMain(env, allowedWorkflowRefs)) return;

  throw new Error(
    `${operation} is disabled when NODE_ENV=production outside GitHub Actions ${EXPECTED_REPOSITORY} ${EXPECTED_REF} and an allowed direct workflow`,
  );
}
