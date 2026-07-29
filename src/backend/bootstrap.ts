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
  console.error(JSON.stringify({
    event: "portfolio.startup_failed",
    failure_code: "startup_failed",
    failure_class: error instanceof Error ? error.name : "unknown_error",
  }));
  process.exit(1);
});
