import { loadRuntimeEnvironment } from "./runtime-config";

void (async () => {
  loadRuntimeEnvironment();
  await import("./index");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
