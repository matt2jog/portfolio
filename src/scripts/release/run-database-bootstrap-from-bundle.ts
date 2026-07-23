import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { readAndDeleteBundle } from "../../shared/ephemeral-bundle";
import { productionSupabaseConnectionConfig } from "../../shared/postgres-tls";
import {
  assertPortfolioLegacyReaderDatabaseSession,
  assertPortfolioMigratorDatabaseSession,
  assertUnprivilegedDatabaseSession,
} from "../../shared/postgres-session";
import { PORTFOLIO_DATA_TABLES } from "../legacy-data-migration";
import {
  assertProductionMutationAllowed,
  DATABASE_BOOTSTRAP_WORKFLOW_REF,
} from "../production-execution-guard";
import {
  parseDatabaseBootstrapBundle,
  type PortfolioDatabaseBootstrapBundle,
} from "./database-bootstrap-config";
import { assertLocalPortfolioImageProvenance } from "./image-provenance";

const IMAGE_PATTERN = /^us-east4-docker\.pkg\.dev\/personal-brand-501801\/portfolio\/portfolio@sha256:[a-f0-9]{64}$/;
const PRE_MIGRATION_SQL = "infra/supabase/portfolio-pre-migration.sql";
const POST_MIGRATION_SQL = "infra/supabase/portfolio-role-acls.sql";
const LEGACY_READER_SQL = "infra/supabase/legacy-reader.sql";
const LOGIN_URLS = [
  ["portfolio_runtime_login", "RUNTIME_DATABASE_URL"],
  ["portfolio_migrator_login", "MIGRATION_DATABASE_URL"],
  ["portfolio_legal_login", "LEGAL_AUDIT_DATABASE_URL"],
  ["portfolio_legacy_reader_login", "LEGACY_READER_DATABASE_URL"],
  ["portfolio_fence_login", "SOURCE_FENCE_DATABASE_URL"],
] as const;
const LOGIN_PROPAGATION_ATTEMPTS = 72;
const LOGIN_PROPAGATION_INTERVAL_MS = 5_000;
const CONNECTION_ATTEMPTS = 6;
const CONNECTION_INTERVAL_MS = 5_000;
const CONNECTION_TIMEOUT_MS = 15_000;
type Sleep = (milliseconds: number) => Promise<void>;
interface ConnectableClient {
  connect(): Promise<unknown>;
  end(): Promise<void>;
}

export interface DatabaseBootstrapDependencies {
  executeAdministratorSql(filename: string, sql: string): Promise<void>;
  rotateLoginPassword(role: string, password: string): Promise<void>;
  waitForLoginCredentials(bundle: PortfolioDatabaseBootstrapBundle): Promise<void>;
  runMigrationsFromBundle(bundle: PortfolioDatabaseBootstrapBundle, imageDigestUri: string): Promise<void>;
  verifyScopedBoundaries(bundle: PortfolioDatabaseBootstrapBundle): Promise<void>;
}

function connectionConfig(
  bundle: PortfolioDatabaseBootstrapBundle,
  databaseUrl: string,
  expectedRole: string,
  capabilityRole?: string,
  searchPath: "portfolio, extensions" | "public" = "portfolio, extensions",
) {
  return {
    ...productionSupabaseConnectionConfig({
      databaseUrl,
      projectRef: bundle.SUPABASE_PROJECT_REF,
      supabaseCaCert: bundle.SUPABASE_CA_CERT,
      expectedCaSha256: bundle.SUPABASE_CA_SHA256,
      expectedRole,
      capabilityRole,
      searchPath,
    }),
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  };
}

async function spawnMigrations(
  bundle: PortfolioDatabaseBootstrapBundle,
  imageDigestUri: string,
): Promise<void> {
  const contextKeys = [
    "NODE_ENV", "GITHUB_ACTIONS", "GITHUB_REPOSITORY", "GITHUB_REF",
    "GITHUB_WORKFLOW_REF", "GITHUB_SHA", "GITHUB_WORKFLOW_SHA",
  ] as const;
  const child = spawn("docker", [
    "run", "--rm", "--pull=never", "--read-only", "--cap-drop=ALL",
    "--security-opt=no-new-privileges", "--pids-limit=128", "--memory=1g", "--cpus=2",
    "--tmpfs=/tmp:rw,noexec,nosuid,size=64m",
    "--env", "DATABASE_URL", "--env", "SUPABASE_CA_CERT", "--env", "SUPABASE_CA_SHA256",
    "--env", "SUPABASE_PROJECT_REF",
    ...contextKeys.flatMap((key) => process.env[key] === undefined ? [] : ["--env", key]),
    imageDigestUri,
    "dist/migrate.cjs",
  ], {
    env: {
      ...process.env,
      DATABASE_URL: bundle.MIGRATION_DATABASE_URL,
      SUPABASE_CA_CERT: bundle.SUPABASE_CA_CERT,
      SUPABASE_CA_SHA256: bundle.SUPABASE_CA_SHA256,
      SUPABASE_PROJECT_REF: bundle.SUPABASE_PROJECT_REF,
    },
    stdio: "inherit",
    shell: false,
  });
  const code = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (value) => resolve(value ?? 1));
  });
  if (code !== 0) throw new Error(`Database-bootstrap migration container exited with code ${code}`);
}

async function withClient(
  config: ReturnType<typeof connectionConfig>,
  action: (client: Client) => Promise<void>,
): Promise<void> {
  const client = await connectWithSupabaseRetry(() => new Client(config));
  try {
    await action(client);
  } finally {
    await client.end();
  }
}

function transientConnectionFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = "code" in error ? String(error.code) : "";
  if (code.startsWith("08")) return true;
  if (["57P03", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT"].includes(code)) return true;
  return code === "XX000" && /auth_query|econnrefused|timed? out/i.test(error.message);
}

export async function connectWithSupabaseRetry<T extends ConnectableClient>(
  createClient: () => T,
  sleep: Sleep = async (milliseconds) => await new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<T> {
  for (let attempt = 1; attempt <= CONNECTION_ATTEMPTS; attempt += 1) {
    const client = createClient();
    try {
      await client.connect();
      return client;
    } catch (error) {
      await client.end().catch(() => undefined);
      if (!transientConnectionFailure(error)) throw error;
      if (attempt === CONNECTION_ATTEMPTS) {
        throw new Error(`Portfolio Supabase pooler remained unavailable after ${CONNECTION_ATTEMPTS} connection attempts`);
      }
      await sleep(CONNECTION_INTERVAL_MS);
    }
  }
  throw new Error("Portfolio Supabase connection retry policy was exhausted");
}

function isPostgresAuthenticationFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  return error.code === "28P01" || error.code === "28000";
}

export async function waitForCredentialPropagation(
  role: (typeof LOGIN_URLS)[number][0],
  probe: () => Promise<boolean>,
  sleep: Sleep = async (milliseconds) => await new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<void> {
  for (let attempt = 1; attempt <= LOGIN_PROPAGATION_ATTEMPTS; attempt += 1) {
    if (await probe()) return;
    if (attempt === LOGIN_PROPAGATION_ATTEMPTS) {
      throw new Error(`Portfolio bootstrap credential did not become usable after rotation: ${role}`);
    }
    await sleep(LOGIN_PROPAGATION_INTERVAL_MS);
  }
}

async function waitForScopedLogin(
  bundle: PortfolioDatabaseBootstrapBundle,
  role: (typeof LOGIN_URLS)[number][0],
  databaseUrl: string,
): Promise<void> {
  const searchPath = role === "portfolio_legacy_reader_login" ? "public" : "portfolio, extensions";
  const config = connectionConfig(bundle, databaseUrl, role, undefined, searchPath);
  await waitForCredentialPropagation(role, async () => {
    try {
      await withClient(config, async (client) => {
        const identity = await client.query<{ sessionUser: string; currentUser: string }>(
          `SELECT session_user AS "sessionUser", current_user AS "currentUser"`,
        );
        if (identity.rows[0]?.sessionUser !== role || identity.rows[0]?.currentUser !== role) {
          throw new Error(`Portfolio bootstrap credential authenticated as an unexpected role: ${role}`);
        }
      });
      return true;
    } catch (error) {
      if (!isPostgresAuthenticationFailure(error)) throw error;
      return false;
    }
  });
}

function productionDependencies(bundle: PortfolioDatabaseBootstrapBundle): DatabaseBootstrapDependencies {
  const adminConfig = connectionConfig(bundle, bundle.DATABASE_ADMIN_URL, "postgres");
  return {
    async executeAdministratorSql(_filename, sql) {
      await withClient(adminConfig, async (client) => { await client.query(sql); });
    },
    async rotateLoginPassword(role, password) {
      if (!LOGIN_URLS.some(([expected]) => expected === role)) throw new Error("Unreviewed Portfolio login role rotation");
      await withClient(adminConfig, async (client) => {
        const generated = await client.query<{ statement: string }>(
          `SELECT format('ALTER ROLE %I PASSWORD %L', $1::text, $2::text) AS statement`,
          [role, password],
        );
        const statement = generated.rows[0]?.statement;
        if (!statement) throw new Error("Portfolio login password rotation statement was not generated");
        await client.query(statement);
      });
    },
    async waitForLoginCredentials(value) {
      for (const [role, key] of LOGIN_URLS) {
        await waitForScopedLogin(value, role, value[key]);
      }
    },
    runMigrationsFromBundle: spawnMigrations,
    async verifyScopedBoundaries(value) {
      await withClient(connectionConfig(value, value.RUNTIME_DATABASE_URL, "portfolio_runtime_login", "portfolio_runtime"), async (client) => {
        await assertUnprivilegedDatabaseSession(client, "portfolio_runtime", "Portfolio runtime bootstrap proof");
      });
      await withClient(connectionConfig(value, value.MIGRATION_DATABASE_URL, "portfolio_migrator_login", "portfolio_migrator"), async (client) => {
        await assertPortfolioMigratorDatabaseSession(client);
      });
      await withClient(connectionConfig(value, value.LEGAL_AUDIT_DATABASE_URL, "portfolio_legal_login", "legal_audit_writer"), async (client) => {
        await assertUnprivilegedDatabaseSession(client, "legal_audit_writer", "Portfolio legal bootstrap proof");
      });
      await withClient(connectionConfig(value, value.LEGACY_READER_DATABASE_URL, "portfolio_legacy_reader_login", "portfolio_legacy_reader", "public"), async (client) => {
        await assertPortfolioLegacyReaderDatabaseSession(client, PORTFOLIO_DATA_TABLES);
      });
      await withClient(connectionConfig(value, value.SOURCE_FENCE_DATABASE_URL, "portfolio_fence_login", "portfolio_fence_operator"), async (client) => {
        await client.query("RESET ROLE");
        const login = await client.query<{ sessionUser: string; currentUser: string }>(
          `SELECT session_user AS "sessionUser", current_user AS "currentUser"`,
        );
        if (login.rows[0]?.sessionUser !== "portfolio_fence_login" || login.rows[0]?.currentUser !== "portfolio_fence_login") {
          throw new Error("Portfolio source-fence LOGIN boundary is invalid");
        }
        await client.query("SET ROLE portfolio_fence_operator");
        const capability = await client.query<{ currentUser: string; activate: boolean; abort: boolean; commit: boolean }>(`
          SELECT current_user AS "currentUser",
            has_function_privilege(current_user, 'portfolio_control.activate_portfolio_source_write_fence(text,integer)', 'EXECUTE') AS activate,
            has_function_privilege(current_user, 'portfolio_control.abort_portfolio_source_write_fence(text)', 'EXECUTE') AS abort,
            has_function_privilege(current_user, 'portfolio_control.commit_portfolio_source_write_fence(text)', 'EXECUTE') AS commit
        `);
        if (
          capability.rows[0]?.currentUser !== "portfolio_fence_operator"
          || !capability.rows[0].activate
          || !capability.rows[0].abort
          || !capability.rows[0].commit
        ) throw new Error("Portfolio source-fence capability boundary is invalid");
        await client.query("RESET ROLE");
      });
    },
  };
}

function passwordFromUrl(databaseUrl: string): string {
  try {
    const password = decodeURIComponent(new URL(databaseUrl).password);
    if (!password) throw new Error("missing");
    return password;
  } catch {
    throw new Error("Portfolio database-bootstrap scoped URL contains an invalid password");
  }
}

export async function runDatabaseBootstrap(
  bundle: PortfolioDatabaseBootstrapBundle,
  imageDigestUri: string,
  dependencies?: DatabaseBootstrapDependencies,
): Promise<void> {
  if (!IMAGE_PATTERN.test(imageDigestUri)) throw new Error("An exact Portfolio image digest is required for database bootstrap");
  const actions = dependencies ?? productionDependencies(bundle);
  const [pre, post, legacyReader] = await Promise.all([
    readFile(path.resolve(process.cwd(), PRE_MIGRATION_SQL), "utf8"),
    readFile(path.resolve(process.cwd(), POST_MIGRATION_SQL), "utf8"),
    readFile(path.resolve(process.cwd(), LEGACY_READER_SQL), "utf8"),
  ]);
  await actions.executeAdministratorSql("portfolio-pre-migration.sql", pre);
  for (const [role, key] of LOGIN_URLS) {
    await actions.rotateLoginPassword(role, passwordFromUrl(bundle[key]));
  }
  await actions.waitForLoginCredentials(bundle);
  await actions.runMigrationsFromBundle(bundle, imageDigestUri);
  await actions.executeAdministratorSql("portfolio-role-acls.sql", post);
  await actions.executeAdministratorSql("legacy-reader.sql", legacyReader);
  await actions.verifyScopedBoundaries(bundle);
}

async function main(): Promise<void> {
  assertProductionMutationAllowed(
    process.env,
    "Portfolio one-time database bootstrap",
    [DATABASE_BOOTSTRAP_WORKFLOW_REF],
  );
  const [bundlePath, imageDigestUri] = process.argv.slice(2);
  if (!bundlePath || !imageDigestUri) throw new Error("A database-bootstrap bundle and exact image digest are required");
  assertLocalPortfolioImageProvenance(imageDigestUri, process.env.GITHUB_SHA ?? "");
  const bundle = parseDatabaseBootstrapBundle(await readAndDeleteBundle(bundlePath));
  await runDatabaseBootstrap(bundle, imageDigestUri);
}

if (process.argv[1]?.endsWith("run-database-bootstrap-from-bundle.ts")) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Portfolio database bootstrap failed");
    process.exit(1);
  });
}
