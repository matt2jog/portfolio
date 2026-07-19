import { execFileSync } from "node:child_process";

const PORTFOLIO_DIGEST_URI = /^us-east4-docker\.pkg\.dev\/personal-brand-501801\/portfolio\/portfolio@sha256:[a-f0-9]{64}$/;
const RELEASE_SHA = /^[a-f0-9]{40}$/;
const SOURCE = "https://github.com/matt2jog/portfolio";

interface DockerImageInspection {
  RepoDigests?: unknown;
  Config?: {
    Labels?: unknown;
  };
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function assertPortfolioImageProvenance(
  inspection: unknown,
  expectedDigestUri: string,
  expectedReleaseSha: string,
): void {
  if (!PORTFOLIO_DIGEST_URI.test(expectedDigestUri)) {
    throw new Error("Portfolio image must use the service-owned digest repository");
  }
  if (!RELEASE_SHA.test(expectedReleaseSha)) throw new Error("Portfolio release SHA is invalid");
  if (!Array.isArray(inspection) || inspection.length !== 1) {
    throw new Error("Docker image inspection must contain exactly one image");
  }
  const image = record(inspection[0]) as DockerImageInspection;
  const labels = record(record(image.Config).Labels);
  const repoDigests = Array.isArray(image.RepoDigests) ? image.RepoDigests : [];
  if (!repoDigests.includes(expectedDigestUri)) {
    throw new Error("Docker image digest is not the exact accepted Portfolio digest");
  }
  if (
    labels["org.opencontainers.image.title"] !== "portfolio"
    || labels["org.opencontainers.image.source"] !== SOURCE
    || labels["org.opencontainers.image.revision"] !== expectedReleaseSha
  ) {
    throw new Error("Docker image provenance is not bound to the current Portfolio release SHA");
  }
}

export function assertLocalPortfolioImageProvenance(
  imageDigestUri: string,
  expectedReleaseSha: string,
): void {
  let inspection: unknown;
  try {
    inspection = JSON.parse(execFileSync(
      "docker",
      ["image", "inspect", imageDigestUri],
      { encoding: "utf8", windowsHide: true },
    )) as unknown;
  } catch (error) {
    throw new Error("Unable to inspect the exact digest-pinned Portfolio image", { cause: error });
  }
  assertPortfolioImageProvenance(inspection, imageDigestUri, expectedReleaseSha);
}

function main(): void {
  const [imageDigestUri, releaseSha] = process.argv.slice(2);
  if (!imageDigestUri || !releaseSha) throw new Error("Image digest URI and release SHA are required");
  assertLocalPortfolioImageProvenance(imageDigestUri, releaseSha);
}

if (process.argv[1]?.endsWith("image-provenance.ts")) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Image provenance verification failed");
    process.exit(1);
  }
}
