import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import {
  portfolioDatabaseBoundary,
  type PortfolioDatabaseBoundary,
} from "../shared/database-boundary";
import { productionSupabaseConnectionConfig } from "../shared/postgres-tls";

function validateDatabaseBoundary(
  target: NodeJS.ProcessEnv,
  boundary: PortfolioDatabaseBoundary,
): void {
  try {
    productionSupabaseConnectionConfig({
      databaseUrl: target.DATABASE_URL ?? "",
      projectRef: target.SUPABASE_PROJECT_REF ?? "",
      supabaseCaCert: target.SUPABASE_CA_CERT,
      expectedCaSha256: target.SUPABASE_CA_SHA256,
      expectedRole: boundary.runtimeLogin,
      capabilityRole: boundary.runtimeRole,
      searchPath: boundary.searchPath,
    });
  } catch (error) {
    throw new Error(
      "Portfolio runtime DATABASE_URL, SUPABASE_PROJECT_REF, SUPABASE_CA_CERT, "
      + "and SUPABASE_CA_SHA256 must identify the scoped Supabase runtime role "
      + "with CA-backed verify-full TLS",
      { cause: error },
    );
  }
}

export function validateRuntimeEnvironment(target: NodeJS.ProcessEnv = process.env): void {
  validateDatabaseBoundary(target, portfolioDatabaseBoundary(target));
  if (!/^[A-Za-z0-9-]{1,39}$/.test(target.GITHUB_USERNAME ?? "")) {
    throw new Error("GITHUB_USERNAME must be provided as an ordinary runtime environment variable");
  }
  if (target.GITHUB_TOKEN !== undefined && target.GITHUB_TOKEN.length === 0) {
    throw new Error("GITHUB_TOKEN must be non-empty when provided");
  }
}

export function loadRuntimeEnvironment(target: NodeJS.ProcessEnv = process.env): void {
  if (target === process.env && target.NODE_ENV !== "production") {
    const envPath = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath, override: false, quiet: true });
    }
  }

  if (target.NODE_ENV === "production") {
    validateRuntimeEnvironment(target);
  }
}
