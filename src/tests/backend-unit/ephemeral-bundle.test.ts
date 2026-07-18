import assert from "node:assert/strict";
import test from "node:test";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readAndDeleteBundle } from "../../shared/ephemeral-bundle";

test("ephemeral bundle reader removes the raw file immediately after a successful read", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "portfolio-bundle-"));
  const file = path.join(directory, "bundle.json");
  try {
    await writeFile(file, "{\"fixture\":true}", { encoding: "utf8", mode: 0o600 });
    assert.equal(await readAndDeleteBundle(file), "{\"fixture\":true}");
    await assert.rejects(access(file), { code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
