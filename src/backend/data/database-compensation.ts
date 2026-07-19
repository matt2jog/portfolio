import type { PoolClient } from "pg";

export interface DatabaseCompensationInput {
  auditId: string;
  expectedCurrentDigest: string;
}

type CompensationClient = Pick<PoolClient, "query">;

export async function assertDatabaseCompensationOperator(
  client: CompensationClient,
): Promise<void> {
  const identity = await client.query<{
    sessionUser: string;
    currentUser: string;
  }>(`
    SELECT
      session_user AS "sessionUser",
      current_user AS "currentUser"
  `);
  if (
    identity.rows.length !== 1
    || identity.rows[0]?.sessionUser !== "portfolio_migrator_login"
    || identity.rows[0]?.currentUser !== "portfolio_migrator"
  ) {
    throw new Error(
      "Database compensation requires the dedicated portfolio_migrator operator boundary",
    );
  }
}

export async function compensateDatabaseMutation(
  client: CompensationClient,
  input: DatabaseCompensationInput,
): Promise<string> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.auditId)) {
    throw new Error("Database compensation auditId is invalid");
  }
  if (!/^[0-9a-f]{64}$/.test(input.expectedCurrentDigest)) {
    throw new Error("Database compensation expectedCurrentDigest is invalid");
  }
  await assertDatabaseCompensationOperator(client);
  const result = await client.query<{ compensationAuditId: string }>(`
    SELECT portfolio.compensate_database_mutation(
      $1::uuid,
      $2::text
    )::text AS "compensationAuditId"
  `, [input.auditId, input.expectedCurrentDigest]);
  const compensationAuditId = result.rows[0]?.compensationAuditId;
  if (!compensationAuditId) {
    throw new Error("Database compensation did not return an audited mutation identifier");
  }
  return compensationAuditId;
}
