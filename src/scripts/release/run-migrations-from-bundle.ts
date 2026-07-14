import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { parseDeploymentBundle } from "./deployment-config";

async function main(): Promise<void> {
  const bundlePath = process.argv[2];
  const imageDigestUri = process.argv[3];
  if (!bundlePath || !imageDigestUri.includes("@sha256:")) {
    throw new Error("A deployment bundle path and digest-pinned image URI are required");
  }

  const raw = await readFile(bundlePath, "utf8");
  const bundle = parseDeploymentBundle(raw);

  const child = spawn(
    "docker",
    [
      "run",
      "--rm",
      "--env",
      "DATABASE_URL",
      "--env",
      "SUPABASE_CA_CERT",
      imageDigestUri,
      "dist/migrate.cjs",
    ],
    {
      env: {
        ...process.env,
        DATABASE_URL: bundle.DATABASE_URL,
        SUPABASE_CA_CERT: bundle.SUPABASE_CA_CERT,
      },
      stdio: "inherit",
      shell: false,
    },
  );

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) throw new Error(`Migration container exited with code ${exitCode}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Migration runner failed");
  process.exit(1);
});
