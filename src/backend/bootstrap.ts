import { ensureRuntimeEnv } from "./infisical";

void (async () => {
  await ensureRuntimeEnv("PORTFOLIO");
  await import("./index");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
