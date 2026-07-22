import assert from "node:assert/strict";
import test from "node:test";
import {
  abortSourceWriteFence,
  activateSourceWriteFence,
  commitSourceWriteFence,
  type SourceFenceQueryable,
} from "../../scripts/release/source-write-fence";

test("source fence activation is a bounded lease over the exact 23-table trigger set", async () => {
  const calls: Array<{ text: string; values?: readonly unknown[] }> = [];
  const client: SourceFenceQueryable = {
    async query(text, values) {
      calls.push({ text, values });
      if (text.includes("activate_portfolio_source_write_fence")) {
        return { rows: [{ fenceToken: "a".repeat(64), expiresAt: "2026-07-16T20:15:00.000Z" }] };
      }
      return { rows: [{ triggerCount: 46, definitions: "exact trigger definitions" }] };
    },
  };
  const evidence = await activateSourceWriteFence(client, "a".repeat(64), 900, new Date("2026-07-16T20:00:00.000Z"));
  assert.equal(evidence.fenceId, "a".repeat(64));
  assert.equal(evidence.expiresAt, "2026-07-16T20:15:00.000Z");
  assert.deepEqual(calls[0]?.values, ["a".repeat(64), 900]);
  assert.match(calls[0]?.text ?? "", /portfolio_control\.activate_portfolio_source_write_fence/);
  assert.match(evidence.triggerDigest, /^[0-9a-f]{64}$/);
});

test("source fence abort and authority commit require the exact token and fail closed", async () => {
  const calls: string[] = [];
  const client: SourceFenceQueryable = {
    async query(text, values) {
      calls.push(`${text}:${String(values?.[0])}`);
      return { rows: [{ accepted: true }] };
    },
  };
  await abortSourceWriteFence(client, "b".repeat(64));
  await commitSourceWriteFence(client, "b".repeat(64));
  assert.equal(calls.length, 2);
  assert.match(calls[0] ?? "", /portfolio_control\.abort_portfolio_source_write_fence/);
  assert.match(calls[1] ?? "", /portfolio_control\.commit_portfolio_source_write_fence/);
  await assert.rejects(() => abortSourceWriteFence({
    async query() { return { rows: [{ accepted: false }] }; },
  }, "b".repeat(64)), /abort/i);
  await assert.rejects(() => commitSourceWriteFence(client, "not-a-token"), /token/i);
});
