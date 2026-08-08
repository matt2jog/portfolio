export interface SnapshotClient {
  query(sql: string): Promise<unknown>;
}

export async function readRepeatableReadSnapshot<T>(
  client: SnapshotClient,
  read: () => Promise<T>,
): Promise<T> {
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    const result = await read();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "Career export failed and its read-only snapshot could not be rolled back",
      );
    }
    throw error;
  }
}
