import { loadRuntimeEnvironment } from "./runtime-config";

void (async () => {
  loadRuntimeEnvironment();
  if (process.env.NODE_ENV === "production") {
    const [{ pool }, { assertRuntimeDatabasePool }] = await Promise.all([
      import("./data/db"),
      import("./data/runtime-database-boundary"),
    ]);
    await assertRuntimeDatabasePool(pool);
  }
  await import("./index");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
