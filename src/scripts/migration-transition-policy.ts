import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import {
  assertCanonicalLedgerPrefix,
  type CanonicalLedgerRow,
  type PortfolioMigration,
} from "./migration-ledger";

const TRANSITION_LOCK_ID = "7166271023188393202";

export type MigrationClassification = "additive" | "data-repair" | "empty-target-only";

export interface MigrationPolicyEntry {
  filename: string;
  journalTimestamp: number;
  checksum: string;
  classification: MigrationClassification;
}

export interface MigrationTransitionPolicy {
  schemaVersion: 1;
  historicalBatch: {
    firstFilename: string;
    lastFilename: string;
    migrationCount: number;
    requiresEmptyTarget: true;
  };
  migrations: MigrationPolicyEntry[];
}

export interface MigrationTransitionDecision {
  completed: number;
  pending: number;
  mode: "empty-first-cutover" | "additive" | "no-op";
}

interface TransitionPolicyOptions {
  policy?: MigrationTransitionPolicy;
  reviewedPolicyDigest?: string;
}

interface MigrationTargetState {
  canonicalRows: CanonicalLedgerRow[];
  targetEmpty: boolean;
}

function freezePolicy(policy: MigrationTransitionPolicy): MigrationTransitionPolicy {
  Object.freeze(policy.historicalBatch);
  for (const migration of policy.migrations) Object.freeze(migration);
  Object.freeze(policy.migrations);
  return Object.freeze(policy);
}

// The first private-schema release has not cut over. Every historical migration is therefore
// intentionally reviewed as one empty-target-only batch, including destructive 0002 and
// data-dependent 0011. Future files must be added here with a reviewed classification.
export const PORTFOLIO_MIGRATION_POLICY = freezePolicy({
  schemaVersion: 1,
  historicalBatch: {
    firstFilename: "0000_mute_zemo.sql",
    lastFilename: "0014_legacy_projection_alignment.sql",
    migrationCount: 15,
    requiresEmptyTarget: true,
  },
  migrations: [
    {
      filename: "0000_mute_zemo.sql",
      journalTimestamp: 1774726449972,
      checksum: "6f92ff5de8ac314f9ef2191c1c21292b6fb76fa8b4b34357efd37bdd81bb04de",
      classification: "empty-target-only",
    },
    {
      filename: "0001_odd_wolf_cub.sql",
      journalTimestamp: 1774966616763,
      checksum: "a242440ef03f091184f4aa7c62b29895330b534bcc4f67337cd93c0dfb0385e5",
      classification: "empty-target-only",
    },
    {
      filename: "0002_lumpy_living_tribunal.sql",
      journalTimestamp: 1774969601003,
      checksum: "fda6e1bd25bd39d81869290745c8563048b5ede29b7bd117fc8b5bbaa8dd9212",
      classification: "empty-target-only",
    },
    {
      filename: "0003_admin_policy_acceptance.sql",
      journalTimestamp: 1744012800000,
      checksum: "dd0d585d3058b0c0340de63fc5a5983db5d3976452284d8530a8be4beac366a0",
      classification: "empty-target-only",
    },
    {
      filename: "0004_keen_naoko.sql",
      journalTimestamp: 1776199224394,
      checksum: "a5141c369ff093802998439cc8ee038d794edb53d48f27f43f175f11cf2abc8d",
      classification: "empty-target-only",
    },
    {
      filename: "0005_legal_document_versions.sql",
      journalTimestamp: 1783972800000,
      checksum: "e605191ccc0ba31d32ea334c5d25d9eae7f3b7213c82bc3f33b9ef3709a8ce86",
      classification: "empty-target-only",
    },
    {
      filename: "0006_browser_tracking.sql",
      journalTimestamp: 1783972800001,
      checksum: "d6ddc0e023b9cbf5a14b6af718cded3b2511859c1dec01416e990f2d1db61f63",
      classification: "empty-target-only",
    },
    {
      filename: "0007_ip_rate_logs.sql",
      journalTimestamp: 1783972800002,
      checksum: "524ff7e6754de9f5d29f07c22f78d97f05eb623f41b5ad0b3f193e11ef703050",
      classification: "empty-target-only",
    },
    {
      filename: "0008_welcome_messages.sql",
      journalTimestamp: 1783972800003,
      checksum: "c416c18a92d99c76ba1e4cc373d4e0df61b1ae5adb49cb869940550c88509309",
      classification: "empty-target-only",
    },
    {
      filename: "0009_ai_models_fireworks_model_id.sql",
      journalTimestamp: 1783972800004,
      checksum: "4c0a66c0c4e177d5d5b2912e28a6ef5ded00188198705929cf1b09ebf618ba55",
      classification: "empty-target-only",
    },
    {
      filename: "0010_legal_document_view_security.sql",
      journalTimestamp: 1784023800000,
      checksum: "bdca9712ba3ecc3f2a473dd0fcf2f4cf13aba2d9d44886872dc6d45a5666248e",
      classification: "empty-target-only",
    },
    {
      filename: "0011_skill_referential_integrity.sql",
      journalTimestamp: 1784023800001,
      checksum: "64e816f00bd6c39a17160fa885ebdcfc19013da28cbfb01684704823966549a5",
      classification: "empty-target-only",
    },
    {
      filename: "0012_remove_personal_information_defaults.sql",
      journalTimestamp: 1784023800002,
      checksum: "5317cd981889d8c8f0845530e45a78399f1d273fd6863f1a192d305154592dbc",
      classification: "empty-target-only",
    },
    {
      filename: "0013_education_projection.sql",
      journalTimestamp: 1784124000000,
      checksum: "97f32512fae649bcff02fc9fca98125daf45429c019d0d5bda876f4e1d7f6940",
      classification: "empty-target-only",
    },
    {
      filename: "0014_legacy_projection_alignment.sql",
      journalTimestamp: 1784124000001,
      checksum: "4001620b0902d42c4c850e0cab362d7850569b10e807937ffcceba90badaefef",
      classification: "empty-target-only",
    },
    {
      filename: "0015_career_pubsub_consumer.sql",
      journalTimestamp: 1784140006019,
      checksum: "add9985ef4609bb72dbbd8dbb47cbe4c3891202e3f9855032f1c832ff33c1b4b",
      classification: "additive",
    },
    {
      filename: "0016_database_audit_compensation.sql",
      journalTimestamp: 1784142974621,
      checksum: "4929ecfbe340c92f3ad4d660f52d08363ebd82d4562b7be8721e06b828a22d1e",
      classification: "additive",
    },
  ],
});

export function migrationPolicyDigest(policy: MigrationTransitionPolicy): string {
  const canonical = JSON.stringify({
    schemaVersion: policy.schemaVersion,
    historicalBatch: {
      firstFilename: policy.historicalBatch.firstFilename,
      lastFilename: policy.historicalBatch.lastFilename,
      migrationCount: policy.historicalBatch.migrationCount,
      requiresEmptyTarget: policy.historicalBatch.requiresEmptyTarget,
    },
    migrations: policy.migrations.map((migration) => ({
      filename: migration.filename,
      journalTimestamp: migration.journalTimestamp,
      checksum: migration.checksum,
      classification: migration.classification,
    })),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

const REVIEWED_POLICY_DIGEST = "403506d3052f3ee864488ed3a5c4377c0a1bca626ba04c89b4c4d1d67bb82ffa";

function assertPolicyShape(policy: MigrationTransitionPolicy): void {
  if (
    policy.schemaVersion !== 1
    || policy.historicalBatch.requiresEmptyTarget !== true
    || !Number.isSafeInteger(policy.historicalBatch.migrationCount)
    || policy.historicalBatch.migrationCount <= 0
    || policy.migrations.length < policy.historicalBatch.migrationCount
  ) {
    throw new Error("Portfolio migration policy structure is invalid");
  }
  const known = new Set<MigrationClassification>([
    "additive",
    "data-repair",
    "empty-target-only",
  ]);
  for (const migration of policy.migrations) {
    if (!known.has(migration.classification)) {
      throw new Error(
        `Unknown migration classification '${String(migration.classification)}' for ${migration.filename}`,
      );
    }
  }
  const first = policy.migrations[0];
  const last = policy.migrations[policy.historicalBatch.migrationCount - 1];
  if (
    first?.filename !== policy.historicalBatch.firstFilename
    || last?.filename !== policy.historicalBatch.lastFilename
  ) {
    throw new Error("Portfolio historical migration batch boundaries drifted");
  }
}

function assertPlanMatchesPolicy(
  plan: readonly PortfolioMigration[],
  policy: MigrationTransitionPolicy,
): void {
  for (let index = 0; index < plan.length; index++) {
    const migration = plan[index];
    const classified = policy.migrations[index];
    if (!classified) {
      throw new Error(
        `${migration.filename} has no explicit reviewed classification in the Portfolio migration policy`,
      );
    }
    if (classified.filename !== migration.filename) {
      throw new Error(
        `Portfolio migration policy order drift at ${migration.filename}; reviewed ${classified.filename}`,
      );
    }
    if (
      classified.journalTimestamp !== migration.journalTimestamp
      || classified.checksum !== migration.checksum
    ) {
      throw new Error(
        `Portfolio migration policy checksum or journal drift: ${migration.filename}`,
      );
    }
  }
  if (policy.migrations.length > plan.length) {
    throw new Error(
      `Portfolio migration policy references missing migration ${policy.migrations[plan.length].filename}`,
    );
  }
}

export function assertMigrationTransitionAllowed(
  plan: readonly PortfolioMigration[],
  canonicalRows: readonly CanonicalLedgerRow[],
  targetEmpty: boolean,
  options: TransitionPolicyOptions = {},
): MigrationTransitionDecision {
  const policy = options.policy ?? PORTFOLIO_MIGRATION_POLICY;
  const reviewedPolicyDigest = options.reviewedPolicyDigest ?? REVIEWED_POLICY_DIGEST;
  if (migrationPolicyDigest(policy) !== reviewedPolicyDigest) {
    throw new Error("Reviewed migration policy digest drift for Portfolio");
  }
  assertPolicyShape(policy);
  assertPlanMatchesPolicy(plan, policy);

  const completed = assertCanonicalLedgerPrefix(plan, canonicalRows);
  const historicalCount = policy.historicalBatch.migrationCount;
  if (completed > 0 && completed < historicalCount) {
    throw new Error(
      `Historical 0000-0014 batch has forbidden partial prefix ${completed}/${historicalCount}; `
      + "restore an empty target or a complete checksum-bound ledger",
    );
  }
  if (completed === 0 && !targetEmpty) {
    throw new Error(
      "Historical 0000-0014 batch may start only from a truly empty Portfolio target",
    );
  }

  const pending = plan.length - completed;
  if (pending === 0) return { completed, pending, mode: "no-op" };

  for (const classified of policy.migrations.slice(completed)) {
    if (classified.classification === "data-repair") {
      throw new Error(
        `Data-repair migration ${classified.filename} requires a separate reviewed path with `
        + "explicit expected counts, hashes, and a maximum threshold",
      );
    }
    if (classified.classification === "empty-target-only" && !targetEmpty) {
      throw new Error(
        `Empty-target-only migration ${classified.filename} cannot run against a populated target`,
      );
    }
  }

  return {
    completed,
    pending,
    mode: completed === 0 ? "empty-first-cutover" : "additive",
  };
}

async function inspectMigrationTarget(
  client: PoolClient,
): Promise<MigrationTargetState> {
  const schema = await client.query<{ oid: string | null }>(
    "SELECT to_regnamespace('portfolio')::oid::text AS oid",
  );
  const schemaOid = schema.rows[0]?.oid;
  if (!schemaOid) return { canonicalRows: [], targetEmpty: true };
  if (!/^\d+$/.test(schemaOid)) {
    throw new Error("Portfolio migration transition policy could not resolve the target schema");
  }

  const state = await client.query<{ hasObjects: boolean; ledgerExists: boolean }>(`
    SELECT
      EXISTS (
        SELECT 1 FROM pg_class WHERE relnamespace = $1::oid
        UNION ALL SELECT 1 FROM pg_proc WHERE pronamespace = $1::oid
        UNION ALL SELECT 1 FROM pg_type WHERE typnamespace = $1::oid
        UNION ALL SELECT 1 FROM pg_constraint WHERE connamespace = $1::oid
        UNION ALL SELECT 1 FROM pg_extension WHERE extnamespace = $1::oid
        UNION ALL SELECT 1 FROM pg_operator WHERE oprnamespace = $1::oid
        UNION ALL SELECT 1 FROM pg_opclass WHERE opcnamespace = $1::oid
        UNION ALL SELECT 1 FROM pg_opfamily WHERE opfnamespace = $1::oid
        UNION ALL SELECT 1 FROM pg_collation WHERE collnamespace = $1::oid
        UNION ALL SELECT 1 FROM pg_conversion WHERE connamespace = $1::oid
        UNION ALL SELECT 1 FROM pg_ts_parser WHERE prsnamespace = $1::oid
        UNION ALL SELECT 1 FROM pg_ts_config WHERE cfgnamespace = $1::oid
        UNION ALL SELECT 1 FROM pg_ts_dict WHERE dictnamespace = $1::oid
        UNION ALL SELECT 1 FROM pg_ts_template WHERE tmplnamespace = $1::oid
        UNION ALL SELECT 1 FROM pg_statistic_ext WHERE stxnamespace = $1::oid
        UNION ALL SELECT 1 FROM pg_default_acl WHERE defaclnamespace = $1::oid
      ) AS "hasObjects",
      to_regclass('portfolio.schema_migrations') IS NOT NULL AS "ledgerExists"
  `, [schemaOid]);

  let canonicalRows: CanonicalLedgerRow[] = [];
  if (state.rows[0]?.ledgerExists) {
    const ledger = await client.query<CanonicalLedgerRow>(`
      SELECT
        filename,
        journal_timestamp::text AS "journalTimestamp",
        checksum
      FROM portfolio.schema_migrations
    `);
    canonicalRows = ledger.rows;
  }
  return {
    canonicalRows,
    targetEmpty: state.rows[0]?.hasObjects === false,
  };
}

export async function withMigrationTransitionPolicy<T>(
  client: PoolClient,
  plan: readonly PortfolioMigration[],
  run: () => Promise<T>,
): Promise<T> {
  await client.query(`SELECT pg_advisory_lock(${TRANSITION_LOCK_ID}::bigint)`);
  let outcome: { ok: true; value: T } | { ok: false; error: unknown };
  try {
    const state = await inspectMigrationTarget(client);
    assertMigrationTransitionAllowed(plan, state.canonicalRows, state.targetEmpty);
    outcome = { ok: true, value: await run() };
  } catch (error) {
    outcome = { ok: false, error };
  }
  const released = await client.query<{ unlocked: boolean }>(
    `SELECT pg_advisory_unlock(${TRANSITION_LOCK_ID}::bigint) AS unlocked`,
  );
  if (released.rows[0]?.unlocked !== true) {
    throw new Error("Portfolio migration transition lock was not released");
  }
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}
