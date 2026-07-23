import { Client } from "pg";
import { readAndDeleteBundle } from "../../shared/ephemeral-bundle";
import { productionSupabaseConnectionConfig } from "../../shared/postgres-tls";
import {
  parseDatabaseBootstrapBundle,
  type PortfolioDatabaseBootstrapBundle,
} from "./database-bootstrap-config";

interface ProbeClient {
  connect(): Promise<unknown>;
  query<T>(sql: string): Promise<{ rows: T[] }>;
  end(): Promise<void>;
}

type ProbeClientFactory = (
  config: ReturnType<typeof productionSupabaseConnectionConfig> & {
    connectionTimeoutMillis: number;
  },
) => ProbeClient;

interface ProbeTarget {
  label: "admin" | "migrator";
  databaseUrl: string;
  expectedRole: "postgres" | "portfolio_migrator_login";
}

function targets(bundle: PortfolioDatabaseBootstrapBundle): ProbeTarget[] {
  return [
    {
      label: "admin",
      databaseUrl: bundle.DATABASE_ADMIN_URL,
      expectedRole: "postgres",
    },
    {
      label: "migrator",
      databaseUrl: bundle.MIGRATION_DATABASE_URL,
      expectedRole: "portfolio_migrator_login",
    },
  ];
}

export async function probeDatabaseBootstrapBundle(
  raw: string,
  createClient: ProbeClientFactory = (config) => new Client(config) as ProbeClient,
): Promise<Array<ProbeTarget["label"]>> {
  const bundle = parseDatabaseBootstrapBundle(raw);
  const healthy: Array<ProbeTarget["label"]> = [];
  for (const target of targets(bundle)) {
    const client = createClient({
      ...productionSupabaseConnectionConfig({
        databaseUrl: target.databaseUrl,
        projectRef: bundle.SUPABASE_PROJECT_REF,
        supabaseCaCert: bundle.SUPABASE_CA_CERT,
        expectedCaSha256: bundle.SUPABASE_CA_SHA256,
        expectedRole: target.expectedRole,
        searchPath: "portfolio, extensions",
      }),
      connectionTimeoutMillis: 15_000,
    });
    try {
      await client.connect();
      const identity = await client.query<{
        sessionUser: string;
        currentUser: string;
      }>(
        `SELECT session_user AS "sessionUser", current_user AS "currentUser"`,
      );
      if (
        identity.rows.length !== 1
        || identity.rows[0]?.sessionUser !== target.expectedRole
        || identity.rows[0]?.currentUser !== target.expectedRole
      ) {
        throw Object.assign(
          new Error("Portfolio bootstrap probe identity mismatch"),
          { code: "IDENTITY" },
        );
      }
      healthy.push(target.label);
    } finally {
      await client.end().catch(() => undefined);
    }
  }
  return healthy;
}

async function main(): Promise<void> {
  const bundlePath = process.argv[2];
  if (!bundlePath) throw new Error("A database-bootstrap bundle path is required");
  const raw = await readAndDeleteBundle(bundlePath);
  const healthy = await probeDatabaseBootstrapBundle(raw);
  console.log(`Portfolio Node pg bootstrap probe: ${healthy.join(",")}=healthy.`);
}

if (process.argv[1]?.endsWith("probe-database-bootstrap-from-bundle.ts")) {
  main().catch((error: unknown) => {
    const code = (
      typeof error === "object"
      && error !== null
      && "code" in error
      && typeof error.code === "string"
      && /^[A-Z0-9_]{1,16}$/.test(error.code)
    )
      ? error.code
      : "unknown";
    console.error(`Portfolio Node pg bootstrap probe failed: code=${code}.`);
    process.exitCode = 1;
  });
}
