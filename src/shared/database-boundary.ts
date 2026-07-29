export type PortfolioDeploymentStage = "production" | "staging";

export interface PortfolioDatabaseBoundary {
  stage: PortfolioDeploymentStage;
  schema: "portfolio" | "portfolio_staging";
  runtimeRole: "portfolio_runtime" | "portfolio_staging_runtime";
  runtimeLogin: "portfolio_runtime_login" | "portfolio_staging_runtime_login";
  migratorRole: "portfolio_migrator" | "portfolio_staging_migrator";
  migratorLogin: "portfolio_migrator_login" | "portfolio_staging_migrator_login";
  resumeOwnerRole: "resume_owner" | "resume_staging_owner";
  resumeAppRole: "resume_app" | "resume_staging_app";
  searchPath: "portfolio, extensions" | "portfolio_staging, extensions";
}

const BOUNDARIES: Record<PortfolioDeploymentStage, PortfolioDatabaseBoundary> = {
  production: {
    stage: "production",
    schema: "portfolio",
    runtimeRole: "portfolio_runtime",
    runtimeLogin: "portfolio_runtime_login",
    migratorRole: "portfolio_migrator",
    migratorLogin: "portfolio_migrator_login",
    resumeOwnerRole: "resume_owner",
    resumeAppRole: "resume_app",
    searchPath: "portfolio, extensions",
  },
  staging: {
    stage: "staging",
    schema: "portfolio_staging",
    runtimeRole: "portfolio_staging_runtime",
    runtimeLogin: "portfolio_staging_runtime_login",
    migratorRole: "portfolio_staging_migrator",
    migratorLogin: "portfolio_staging_migrator_login",
    resumeOwnerRole: "resume_staging_owner",
    resumeAppRole: "resume_staging_app",
    searchPath: "portfolio_staging, extensions",
  },
};

export function portfolioDatabaseBoundary(
  environment: NodeJS.ProcessEnv = process.env,
): PortfolioDatabaseBoundary {
  const configured = environment.DEPLOYMENT_STAGE;
  const stage = configured === undefined ? "production" : configured.trim();
  if (stage !== "production" && stage !== "staging") {
    throw new Error("DEPLOYMENT_STAGE must be production or staging");
  }
  return BOUNDARIES[stage];
}

export function portfolioBoundaryForRole(
  role: string,
): PortfolioDatabaseBoundary | undefined {
  return Object.values(BOUNDARIES).find(
    (boundary) => boundary.runtimeRole === role || boundary.migratorRole === role,
  );
}

export function renderPortfolioMigrationSql(
  source: string,
  boundary: PortfolioDatabaseBoundary,
): string {
  if (boundary.stage === "production") return source;
  return source
    .replaceAll(
      /\bpublic\.experience_bullets\b/g,
      `${boundary.schema}.__no_legacy_experience_bullets`,
    )
    .replaceAll(/\bresume_owner\b/g, boundary.resumeOwnerRole)
    .replaceAll(/\bresume_app\b/g, boundary.resumeAppRole)
    .replaceAll(/\bportfolio_runtime\b/g, boundary.runtimeRole)
    .replaceAll(/\bportfolio_migrator\b/g, boundary.migratorRole)
    .replaceAll(/\bSCHEMA portfolio\b/g, `SCHEMA ${boundary.schema}`)
    .replaceAll(
      /\bSET LOCAL search_path = portfolio, extensions, public\b/g,
      `SET LOCAL search_path = ${boundary.schema}, extensions, public`,
    )
    .replaceAll(
      /\bSET LOCAL search_path TO portfolio, pg_catalog\b/g,
      `SET LOCAL search_path TO ${boundary.schema}, pg_catalog`,
    )
    .replaceAll(/\bportfolio\./g, `${boundary.schema}.`);
}
