import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { validateTursoConnection } from "../shared/turso-connection";

export function validateRuntimeEnvironment(target: NodeJS.ProcessEnv = process.env): void {
  validateTursoConnection({
    url: target.TURSO_DATABASE_URL ?? "",
    authToken: target.TURSO_AUTH_TOKEN,
    remoteRequired: target.NODE_ENV === "production",
  });
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
    if (fs.existsSync(envPath)) dotenv.config({ path: envPath, override: false, quiet: true });
  }
  if (target.NODE_ENV === "production") validateRuntimeEnvironment(target);
}
