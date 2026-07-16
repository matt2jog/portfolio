import { createHash } from "node:crypto";
import { PORTFOLIO_DATA_TABLES } from "../legacy-data-migration";

const TOKEN = /^[0-9a-f]{64}$/;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export interface SourceFenceQueryable {
  query(text: string, values?: readonly unknown[]): Promise<{ rows: unknown[] }>;
}

export interface SourceWriteFenceEvidence {
  fenceId: string;
  active: true;
  verifiedAt: string;
  expiresAt: string;
  triggerDigest: string;
}

function exactToken(value: string): string {
  if (!TOKEN.test(value)) throw new Error("Portfolio source-fence token is invalid");
  return value;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Portfolio source-fence database response is invalid");
  }
  return value as Record<string, unknown>;
}

export async function activateSourceWriteFence(
  client: SourceFenceQueryable,
  fenceToken: string,
  lifetimeSeconds = 900,
  now = new Date(),
): Promise<SourceWriteFenceEvidence> {
  exactToken(fenceToken);
  if (!Number.isSafeInteger(lifetimeSeconds) || lifetimeSeconds < 300 || lifetimeSeconds > 1800) {
    throw new Error("Portfolio source-fence lifetime must be between 300 and 1800 seconds");
  }
  const activated = await client.query(
    `SELECT fence_token AS "fenceToken", expires_at AS "expiresAt"
     FROM public.activate_portfolio_source_write_fence($1::text, $2::integer)`,
    [fenceToken, lifetimeSeconds],
  );
  const lease = record(activated.rows[0]);
  const expiresAt = lease.expiresAt instanceof Date
    ? lease.expiresAt.toISOString()
    : String(lease.expiresAt ?? "");
  if (lease.fenceToken !== fenceToken || !UTC_TIMESTAMP.test(expiresAt) || Date.parse(expiresAt) <= now.getTime()) {
    throw new Error("Portfolio source-fence lease activation was not verified");
  }

  const triggers = await client.query(`
    SELECT
      string_agg(pg_get_triggerdef(trigger.oid, true), E'\n' ORDER BY object.relname, trigger.tgname) AS definitions,
      count(*)::int AS "triggerCount"
    FROM pg_trigger trigger
    JOIN pg_class object ON object.oid = trigger.tgrelid
    JOIN pg_namespace namespace ON namespace.oid = object.relnamespace
    WHERE namespace.nspname = 'public'
      AND object.relname = ANY($1::text[])
      AND trigger.tgname IN ('portfolio_legacy_write_fence_row', 'portfolio_legacy_write_fence_truncate')
      AND NOT trigger.tgisinternal
  `, [[...PORTFOLIO_DATA_TABLES]]);
  const trigger = record(triggers.rows[0]);
  const definitions = typeof trigger.definitions === "string" ? trigger.definitions : "";
  if (trigger.triggerCount !== PORTFOLIO_DATA_TABLES.length * 2 || !definitions) {
    await abortSourceWriteFence(client, fenceToken).catch(() => undefined);
    throw new Error("Portfolio source-fence trigger inventory is incomplete");
  }
  return {
    fenceId: fenceToken,
    active: true,
    verifiedAt: now.toISOString(),
    expiresAt,
    triggerDigest: createHash("sha256").update(definitions, "utf8").digest("hex"),
  };
}

export async function abortSourceWriteFence(client: SourceFenceQueryable, fenceToken: string): Promise<void> {
  const result = await client.query(
    `SELECT public.abort_portfolio_source_write_fence($1::text) AS accepted`,
    [exactToken(fenceToken)],
  );
  if (record(result.rows[0]).accepted !== true) {
    throw new Error("Portfolio source-fence abort was not accepted");
  }
}

export async function commitSourceWriteFence(client: SourceFenceQueryable, fenceToken: string): Promise<void> {
  const result = await client.query(
    `SELECT public.commit_portfolio_source_write_fence($1::text) AS accepted`,
    [exactToken(fenceToken)],
  );
  if (record(result.rows[0]).accepted !== true) {
    throw new Error("Portfolio source-fence authority commit was not accepted");
  }
}
