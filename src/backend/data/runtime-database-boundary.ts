import { assertUnprivilegedDatabaseSession } from "../../shared/postgres-session";

interface Queryable {
  query(text: string): Promise<{ rows: unknown[] }>;
}

export async function assertRuntimeDatabaseSession(queryable: Queryable): Promise<void> {
  await assertUnprivilegedDatabaseSession(queryable, "portfolio_runtime", "Portfolio runtime");
}
