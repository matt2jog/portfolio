import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const IMAGE_PATTERN = /^us-east4-docker\.pkg\.dev\/personal-brand-501801\/portfolio\/portfolio@sha256:[0-9a-f]{64}$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const RUN_ID_PATTERN = /^[1-9][0-9]*$/;
const EXACT_KEYS = ["schemaVersion", "repository", "releaseSha", "workflowRunId", "imageDigestUri"] as const;

export interface ReleaseImageRecord {
  schemaVersion: 1;
  repository: "matt2jog/portfolio";
  releaseSha: string;
  workflowRunId: string;
  imageDigestUri: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createReleaseImageRecord(
  releaseSha: string,
  imageDigestUri: string,
  workflowRunId: string,
): ReleaseImageRecord {
  if (!SHA_PATTERN.test(releaseSha) || !IMAGE_PATTERN.test(imageDigestUri) || !RUN_ID_PATTERN.test(workflowRunId)) {
    throw new Error("Portfolio release image record inputs are invalid");
  }
  return {
    schemaVersion: 1,
    repository: "matt2jog/portfolio",
    releaseSha,
    workflowRunId,
    imageDigestUri,
  };
}

export function parseReleaseImageRecord(
  raw: string,
  expected: { releaseSha: string; workflowRunId: string },
): ReleaseImageRecord {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Portfolio release image record is not valid JSON");
  }
  if (!isRecord(value) || Object.keys(value).length !== EXACT_KEYS.length || EXACT_KEYS.some((key) => !(key in value))) {
    throw new Error("Portfolio release image record does not match its schema");
  }
  const record = value as unknown as ReleaseImageRecord;
  if (
    record.schemaVersion !== 1
    || record.repository !== "matt2jog/portfolio"
    || record.releaseSha !== expected.releaseSha
    || record.workflowRunId !== expected.workflowRunId
    || !SHA_PATTERN.test(record.releaseSha)
    || !RUN_ID_PATTERN.test(record.workflowRunId)
    || !IMAGE_PATTERN.test(record.imageDigestUri)
  ) {
    throw new Error("Portfolio release image record is not bound to the expected SHA, run, and service-owned digest");
  }
  return { ...record };
}

async function main(): Promise<void> {
  if (process.argv[2] === "create") {
    const record = createReleaseImageRecord(process.argv[3] ?? "", process.argv[4] ?? "", process.argv[5] ?? "");
    process.stdout.write(`${JSON.stringify(record)}\n`);
    return;
  }
  const [filename, releaseSha, workflowRunId] = process.argv.slice(2);
  if (!filename) throw new Error("A Portfolio release image record is required");
  const record = parseReleaseImageRecord(await readFile(filename, "utf8"), {
    releaseSha: releaseSha ?? "",
    workflowRunId: workflowRunId ?? "",
  });
  process.stdout.write(`${record.imageDigestUri}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Portfolio release image record failed");
    process.exitCode = 1;
  });
}
