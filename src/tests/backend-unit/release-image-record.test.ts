import assert from "node:assert/strict";
import test from "node:test";
import {
  createReleaseImageRecord,
  parseReleaseImageRecord,
} from "../../scripts/release/release-image-record";

const releaseSha = "a".repeat(40);
const imageDigestUri = `us-east4-docker.pkg.dev/personal-brand-501801/portfolio/portfolio@sha256:${"b".repeat(64)}`;

test("release image record binds one service-owned digest to the exact release SHA and workflow run", () => {
  const record = createReleaseImageRecord(releaseSha, imageDigestUri, "12345");
  assert.deepEqual(parseReleaseImageRecord(JSON.stringify(record), {
    releaseSha,
    workflowRunId: "12345",
  }), record);
});

test("release image record rejects SHA, run, repository, digest, and extra-field drift", () => {
  const record = createReleaseImageRecord(releaseSha, imageDigestUri, "12345");
  for (const value of [
    { ...record, releaseSha: "c".repeat(40) },
    { ...record, workflowRunId: "12346" },
    { ...record, repository: "matt2jog/assets" },
    { ...record, imageDigestUri: imageDigestUri.replace("/portfolio/portfolio@", "/assets/assets@") },
    { ...record, extra: true },
  ]) {
    assert.throws(
      () => parseReleaseImageRecord(JSON.stringify(value), { releaseSha, workflowRunId: "12345" }),
      /release image/i,
    );
  }
});
