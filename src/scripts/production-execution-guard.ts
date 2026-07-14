const EXPECTED_REPOSITORY = "matt2jog/portfolio";
const EXPECTED_REF = "refs/heads/main";

export function isExpectedPortfolioActionsMain(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.GITHUB_ACTIONS === "true"
    && env.GITHUB_REPOSITORY === EXPECTED_REPOSITORY
    && env.GITHUB_REF === EXPECTED_REF;
}

export function assertProductionMutationAllowed(
  env: NodeJS.ProcessEnv = process.env,
  operation = "Production mutation",
): void {
  if (env.NODE_ENV !== "production" || isExpectedPortfolioActionsMain(env)) return;

  throw new Error(
    `${operation} is disabled when NODE_ENV=production outside GitHub Actions ${EXPECTED_REPOSITORY} ${EXPECTED_REF}`,
  );
}
