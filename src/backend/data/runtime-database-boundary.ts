import { assertUnprivilegedDatabaseSession } from "../../shared/postgres-session";
import { portfolioDatabaseBoundary } from "../../shared/database-boundary";

interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

interface ReleasableQueryable extends Queryable {
  release(): void;
}

interface ConnectablePool {
  connect(): Promise<ReleasableQueryable>;
}

export async function assertRuntimeDatabaseSession(queryable: Queryable): Promise<void> {
  await assertUnprivilegedDatabaseSession(
    queryable,
    portfolioDatabaseBoundary().runtimeRole,
    "Portfolio runtime",
  );
}

export async function assertRuntimeDatabasePool(pool: ConnectablePool): Promise<void> {
  const client = await pool.connect();
  try {
    await assertRuntimeDatabaseSession(client);
  } finally {
    client.release();
  }
}
