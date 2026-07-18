import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { PoolClient } from "pg";

const STATEMENT_BREAKPOINT = "--> statement-breakpoint";
const MIGRATION_TAG = /^\d{4}_[a-z0-9_]+$/;
const MIGRATION_LOCK_ID = "7166271023188393201";
const ACTUAL_SEARCH_PATH = "portfolio, extensions, pg_temp";
const EXPECTED_SEARCH_PATH = "pg_temp, extensions";
const VECTOR_EXTENSION_OWNER = "postgres";

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

export interface PortfolioMigration {
  filename: string;
  journalTimestamp: number;
  checksum: string;
  statements: string[];
}

export interface CanonicalLedgerRow {
  filename: string;
  journalTimestamp: string;
  checksum: string;
}

export interface LegacyLedgerRow {
  hash: string;
  createdAt: string;
}

export interface MigrationResult {
  adopted: number;
  applied: number;
  total: number;
}

interface FingerprintRow {
  category: string;
  identity: string;
  definition: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJournal(raw: string): Journal {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Migration journal is not valid JSON");
  }
  if (
    !isRecord(value) ||
    value.version !== "7" ||
    value.dialect !== "postgresql"
  ) {
    throw new Error(
      "Migration journal must use Drizzle PostgreSQL journal version 7",
    );
  }
  if (!Array.isArray(value.entries)) {
    throw new Error("Migration journal entries are missing");
  }
  const entries = value.entries.map((entry, expectedIndex): JournalEntry => {
    if (
      !isRecord(entry) ||
      entry.idx !== expectedIndex ||
      entry.version !== "7" ||
      !Number.isSafeInteger(entry.when) ||
      typeof entry.tag !== "string" ||
      !MIGRATION_TAG.test(entry.tag) ||
      entry.breakpoints !== true
    ) {
      throw new Error(
        `Migration journal index ${expectedIndex} is not contiguous or canonical`,
      );
    }
    return entry as unknown as JournalEntry;
  });
  const tags = new Set(entries.map((entry) => entry.tag));
  const timestamps = new Set(entries.map((entry) => entry.when));
  if (tags.size !== entries.length)
    throw new Error("Migration journal contains a duplicate tag");
  if (timestamps.size !== entries.length) {
    throw new Error("Migration journal contains a duplicate timestamp");
  }
  return { version: "7", dialect: "postgresql", entries };
}

function canonicalSql(raw: string): string {
  return raw.replace(/\r\n?/g, "\n");
}

export function loadMigrationPlan(
  migrationsFolder: string,
): PortfolioMigration[] {
  const journal = parseJournal(
    readFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "utf8"),
  );
  const expectedFiles = journal.entries.map((entry) => `${entry.tag}.sql`);
  const expected = new Set(expectedFiles);
  const actualFiles = readdirSync(migrationsFolder)
    .filter((filename) => filename.endsWith(".sql"))
    .sort();
  const missing = expectedFiles.filter(
    (filename) => !actualFiles.includes(filename),
  );
  const extra = actualFiles.filter((filename) => !expected.has(filename));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      "Migration directory contains missing or unjournaled extra SQL files",
    );
  }

  return journal.entries.map((entry) => {
    const filename = `${entry.tag}.sql`;
    const sql = canonicalSql(
      readFileSync(path.join(migrationsFolder, filename), "utf8"),
    );
    const statements = sql
      .split(STATEMENT_BREAKPOINT)
      .map((statement) => statement.trim())
      .filter(Boolean);
    if (statements.length === 0)
      throw new Error(`Migration ${filename} contains no SQL`);
    return {
      filename,
      journalTimestamp: entry.when,
      checksum: createHash("sha256").update(sql).digest("hex"),
      statements,
    };
  });
}

export function assertCanonicalLedgerPrefix(
  plan: readonly PortfolioMigration[],
  rows: readonly CanonicalLedgerRow[],
): number {
  if (rows.length > plan.length)
    throw new Error("Canonical migration ledger contains extra entries");
  const byFilename = new Map<string, CanonicalLedgerRow>();
  for (const row of rows) {
    if (byFilename.has(row.filename))
      throw new Error("Canonical migration ledger contains duplicate entries");
    byFilename.set(row.filename, row);
  }
  for (let index = 0; index < rows.length; index++) {
    const migration = plan[index];
    const row = byFilename.get(migration.filename);
    if (!row)
      throw new Error(
        "Canonical migration ledger contains a gap and is not an exact prefix",
      );
    if (
      row.journalTimestamp !== String(migration.journalTimestamp) ||
      row.checksum !== migration.checksum
    ) {
      throw new Error(
        `Canonical migration ledger checksum or journal drift: ${migration.filename}`,
      );
    }
  }
  return rows.length;
}

export function assertLegacyLedgerPrefix(
  plan: readonly PortfolioMigration[],
  rows: readonly LegacyLedgerRow[],
): number {
  if (rows.length > plan.length)
    throw new Error("Legacy migration ledger contains extra entries");
  const byTimestamp = new Map<string, LegacyLedgerRow>();
  for (const row of rows) {
    if (byTimestamp.has(row.createdAt))
      throw new Error("Legacy migration ledger contains duplicate entries");
    byTimestamp.set(row.createdAt, row);
  }
  for (let index = 0; index < rows.length; index++) {
    const migration = plan[index];
    const row = byTimestamp.get(String(migration.journalTimestamp));
    if (!row)
      throw new Error(
        "Legacy migration ledger contains a gap or unknown entry, not an exact prefix",
      );
    if (row.hash !== migration.checksum) {
      throw new Error(
        `Legacy migration ledger checksum drift: ${migration.filename}`,
      );
    }
  }
  return rows.length;
}

const SCHEMA_FINGERPRINT_SQL = `
  WITH target AS (
    SELECT oid, nspname
    FROM pg_namespace
    WHERE oid = $1::oid
  ), fingerprint AS (
    SELECT
      'schema'::text AS category,
      '<schema>'::text AS identity,
      jsonb_build_object(
        'owner', CASE
          WHEN target.oid = pg_my_temp_schema() THEN $2::text
          ELSE owner.rolname
        END
      )::text AS definition
    FROM target
    JOIN pg_namespace namespace ON namespace.oid = target.oid
    JOIN pg_roles owner ON owner.oid = namespace.nspowner

    UNION ALL
    SELECT
      'relation'::text AS category,
      object.relname::text AS identity,
      jsonb_build_object(
        'kind', object.relkind,
        'persistence', CASE
          WHEN object.relpersistence = 't' AND target.oid = pg_my_temp_schema() THEN 'p'
          ELSE object.relpersistence
        END,
        'owner', owner.rolname,
        'accessMethod', access_method.amname,
        'tablespace', COALESCE(tablespace.spcname, 'pg_default'),
        'rowSecurity', object.relrowsecurity,
        'forceRowSecurity', object.relforcerowsecurity,
        'replicaIdentity', object.relreplident,
        'isPartition', object.relispartition,
        'isPopulated', object.relispopulated,
        'options', to_jsonb(object.reloptions),
        'partitionParent', (
          SELECT parent.relname
          FROM pg_inherits inheritance
          JOIN pg_class parent ON parent.oid = inheritance.inhparent
          WHERE inheritance.inhrelid = object.oid
          ORDER BY inheritance.inhseqno
          LIMIT 1
        ),
        'partitionBound', CASE WHEN object.relpartbound IS NULL THEN NULL ELSE
          replace(pg_get_expr(object.relpartbound, object.oid, true), target.nspname || '.', '<schema>.')
        END,
        'viewDefinition', CASE WHEN object.relkind IN ('v', 'm') THEN
          replace(pg_get_viewdef(object.oid, true), target.nspname || '.', '<schema>.')
        ELSE NULL END,
        'sequence', CASE WHEN object.relkind = 'S' THEN jsonb_build_object(
          'type', format_type(sequence.seqtypid, NULL),
          'start', sequence.seqstart,
          'increment', sequence.seqincrement,
          'minimum', sequence.seqmin,
          'maximum', sequence.seqmax,
          'cache', sequence.seqcache,
          'cycle', sequence.seqcycle
        ) ELSE NULL END,
        'foreignTable', CASE WHEN foreign_table.ftrelid IS NULL THEN NULL ELSE jsonb_build_object(
          'server', foreign_server.srvname,
          'options', to_jsonb(foreign_table.ftoptions)
        ) END
      )::text AS definition
    FROM pg_class object
    JOIN target ON target.oid = object.relnamespace
    JOIN pg_roles owner ON owner.oid = object.relowner
    LEFT JOIN pg_am access_method ON access_method.oid = object.relam
    LEFT JOIN pg_tablespace tablespace ON tablespace.oid = object.reltablespace
    LEFT JOIN pg_sequence sequence ON sequence.seqrelid = object.oid
    LEFT JOIN pg_foreign_table foreign_table ON foreign_table.ftrelid = object.oid
    LEFT JOIN pg_foreign_server foreign_server ON foreign_server.oid = foreign_table.ftserver
    WHERE object.relkind IN ('r', 'p', 'v', 'm', 'S', 'f', 'c')

    UNION ALL
    SELECT
      'column',
      relation.relname || ':' || lpad(attribute.attnum::text, 5, '0') || ':'
        || CASE WHEN attribute.attisdropped THEN '<dropped>' ELSE attribute.attname END,
      jsonb_build_object(
        'name', CASE WHEN attribute.attisdropped THEN NULL ELSE attribute.attname END,
        'dropped', attribute.attisdropped,
        'type', CASE WHEN attribute.attisdropped THEN NULL ELSE format_type(attribute.atttypid, attribute.atttypmod) END,
        'typeSchema', CASE WHEN attribute.attisdropped THEN NULL ELSE type_namespace.nspname END,
        'typeName', CASE WHEN attribute.attisdropped THEN NULL ELSE attribute_type.typname END,
        'typeModifier', attribute.atttypmod,
        'dimensions', attribute.attndims,
        'notNull', attribute.attnotnull,
        'hasDefault', attribute.atthasdef,
        'hasMissing', attribute.atthasmissing,
        'identity', attribute.attidentity,
        'generated', attribute.attgenerated,
        'storage', attribute.attstorage,
        'compression', attribute.attcompression,
        'local', attribute.attislocal,
        'inheritanceCount', attribute.attinhcount,
        'options', to_jsonb(attribute.attoptions),
        'foreignOptions', to_jsonb(attribute.attfdwoptions),
        'collation', CASE WHEN collation_object.oid IS NULL THEN NULL
          ELSE collation_namespace.nspname || '.' || collation_object.collname END,
        'default', CASE WHEN attribute_default.oid IS NULL THEN NULL ELSE
          replace(
            pg_get_expr(attribute_default.adbin, attribute_default.adrelid, true),
            target.nspname || '.',
            '<schema>.'
          )
        END
      )::text
    FROM pg_attribute attribute
    JOIN pg_class relation ON relation.oid = attribute.attrelid
    JOIN target ON target.oid = relation.relnamespace
    LEFT JOIN pg_attrdef attribute_default
      ON attribute_default.adrelid = relation.oid
      AND attribute_default.adnum = attribute.attnum
    LEFT JOIN pg_type attribute_type ON attribute_type.oid = attribute.atttypid
    LEFT JOIN pg_namespace type_namespace ON type_namespace.oid = attribute_type.typnamespace
    LEFT JOIN pg_collation collation_object ON collation_object.oid = attribute.attcollation
    LEFT JOIN pg_namespace collation_namespace
      ON collation_namespace.oid = collation_object.collnamespace
    WHERE attribute.attnum > 0

    UNION ALL
    SELECT
      'constraint',
      COALESCE(relation.relname, type.typname, '') || ':' || constraint_object.conname,
      jsonb_build_object(
        'kind', constraint_object.contype,
        'deferrable', constraint_object.condeferrable,
        'deferred', constraint_object.condeferred,
        'validated', constraint_object.convalidated,
        'noInherit', constraint_object.connoinherit,
        'local', constraint_object.conislocal,
        'inheritanceCount', constraint_object.coninhcount,
        'parent', parent_constraint.conname,
        'columns', to_jsonb(constraint_object.conkey),
        'referencedColumns', to_jsonb(constraint_object.confkey),
        'definition', replace(
          pg_get_constraintdef(constraint_object.oid, true),
          target.nspname || '.',
          '<schema>.'
        )
      )::text
    FROM pg_constraint constraint_object
    JOIN target ON target.oid = constraint_object.connamespace
    LEFT JOIN pg_class relation ON relation.oid = constraint_object.conrelid
    LEFT JOIN pg_type type ON type.oid = constraint_object.contypid
    LEFT JOIN pg_constraint parent_constraint ON parent_constraint.oid = constraint_object.conparentid

    UNION ALL
    SELECT
      'index',
      table_object.relname || ':' || index_object.relname,
      jsonb_build_object(
        'owner', owner.rolname,
        'accessMethod', access_method.amname,
        'unique', index_metadata.indisunique,
        'primary', index_metadata.indisprimary,
        'exclusion', index_metadata.indisexclusion,
        'nullsNotDistinct', index_metadata.indnullsnotdistinct,
        'immediate', index_metadata.indimmediate,
        'clustered', index_metadata.indisclustered,
        'valid', index_metadata.indisvalid,
        'ready', index_metadata.indisready,
        'live', index_metadata.indislive,
        'replicaIdentity', index_metadata.indisreplident,
        'attributes', index_metadata.indnatts,
        'keyAttributes', index_metadata.indnkeyatts,
        'options', to_jsonb(index_object.reloptions),
        'definition', replace(
          pg_get_indexdef(index_object.oid),
          target.nspname || '.',
          '<schema>.'
        )
      )::text
    FROM pg_index index_metadata
    JOIN pg_class index_object ON index_object.oid = index_metadata.indexrelid
    JOIN pg_class table_object ON table_object.oid = index_metadata.indrelid
    JOIN target ON target.oid = table_object.relnamespace
    JOIN pg_roles owner ON owner.oid = index_object.relowner
    LEFT JOIN pg_am access_method ON access_method.oid = index_object.relam

    UNION ALL
    SELECT
      'routine',
      routine.proname || '(' || pg_get_function_identity_arguments(routine.oid) || ')',
      jsonb_build_object(
        'kind', routine.prokind,
        'owner', owner.rolname,
        'language', language.lanname,
        'result', replace(pg_get_function_result(routine.oid), target.nspname || '.', '<schema>.'),
        'arguments', replace(pg_get_function_arguments(routine.oid), target.nspname || '.', '<schema>.'),
        'securityDefiner', routine.prosecdef,
        'leakproof', routine.proleakproof,
        'strict', routine.proisstrict,
        'returnsSet', routine.proretset,
        'volatility', routine.provolatile,
        'parallel', routine.proparallel,
        'cost', routine.procost,
        'rows', routine.prorows,
        'configuration', to_jsonb(routine.proconfig),
        'support', CASE WHEN routine.prosupport = 0 THEN NULL ELSE
          replace(routine.prosupport::regproc::text, target.nspname || '.', '<schema>.')
        END,
        'binary', routine.probin,
        'source', replace(routine.prosrc, target.nspname || '.', '<schema>.'),
        'definition', replace(
          CASE WHEN routine.prokind = 'a' THEN routine.prosrc ELSE pg_get_functiondef(routine.oid) END,
          target.nspname || '.',
          '<schema>.'
        )
      )::text
    FROM pg_proc routine
    JOIN target ON target.oid = routine.pronamespace
    JOIN pg_roles owner ON owner.oid = routine.proowner
    JOIN pg_language language ON language.oid = routine.prolang

    UNION ALL
    SELECT
      'type',
      type.typname,
      jsonb_build_object(
        'kind', type.typtype,
        'owner', owner.rolname,
        'category', type.typcategory,
        'preferred', type.typispreferred,
        'defined', type.typisdefined,
        'notNull', type.typnotnull,
        'length', type.typlen,
        'byValue', type.typbyval,
        'alignment', type.typalign,
        'storage', type.typstorage,
        'delimiter', type.typdelim,
        'baseType', CASE WHEN type.typbasetype = 0 THEN NULL ELSE format_type(type.typbasetype, type.typtypmod) END,
        'default', type.typdefault,
        'input', replace(type.typinput::regproc::text, target.nspname || '.', '<schema>.'),
        'output', replace(type.typoutput::regproc::text, target.nspname || '.', '<schema>.'),
        'receive', CASE WHEN type.typreceive = 0 THEN NULL ELSE
          replace(type.typreceive::regproc::text, target.nspname || '.', '<schema>.') END,
        'send', CASE WHEN type.typsend = 0 THEN NULL ELSE
          replace(type.typsend::regproc::text, target.nspname || '.', '<schema>.') END,
        'modifierInput', CASE WHEN type.typmodin = 0 THEN NULL ELSE
          replace(type.typmodin::regproc::text, target.nspname || '.', '<schema>.') END,
        'modifierOutput', CASE WHEN type.typmodout = 0 THEN NULL ELSE
          replace(type.typmodout::regproc::text, target.nspname || '.', '<schema>.') END,
        'analyze', CASE WHEN type.typanalyze = 0 THEN NULL ELSE
          replace(type.typanalyze::regproc::text, target.nspname || '.', '<schema>.') END,
        'subscript', CASE WHEN type.typsubscript = 0 THEN NULL ELSE
          replace(type.typsubscript::regproc::text, target.nspname || '.', '<schema>.') END,
        'collation', CASE WHEN collation_object.oid IS NULL THEN NULL
          ELSE collation_namespace.nspname || '.' || collation_object.collname END,
        'enumLabels', COALESCE((
          SELECT jsonb_agg(enum.enumlabel ORDER BY enum.enumsortorder)
          FROM pg_enum enum WHERE enum.enumtypid = type.oid
        ), '[]'::jsonb),
        'rangeSubtype', CASE WHEN range_object.rngtypid IS NULL THEN NULL
          ELSE format_type(range_object.rngsubtype, NULL) END,
        'rangeCollation', CASE WHEN range_object.rngcollation = 0 THEN NULL ELSE
          range_collation_namespace.nspname || '.' || range_collation.collname END,
        'rangeCanonical', CASE WHEN range_object.rngcanonical = 0 THEN NULL ELSE
          replace(range_object.rngcanonical::regproc::text, target.nspname || '.', '<schema>.') END,
        'rangeDifference', CASE WHEN range_object.rngsubdiff = 0 THEN NULL ELSE
          replace(range_object.rngsubdiff::regproc::text, target.nspname || '.', '<schema>.') END,
        'multirangeType', CASE WHEN range_object.rngmultitypid = 0 THEN NULL ELSE
          format_type(range_object.rngmultitypid, NULL) END
      )::text
    FROM pg_type type
    JOIN target ON target.oid = type.typnamespace
    JOIN pg_roles owner ON owner.oid = type.typowner
    LEFT JOIN pg_collation collation_object ON collation_object.oid = type.typcollation
    LEFT JOIN pg_namespace collation_namespace
      ON collation_namespace.oid = collation_object.collnamespace
    LEFT JOIN pg_range range_object ON range_object.rngtypid = type.oid
    LEFT JOIN pg_collation range_collation ON range_collation.oid = range_object.rngcollation
    LEFT JOIN pg_namespace range_collation_namespace
      ON range_collation_namespace.oid = range_collation.collnamespace
    LEFT JOIN pg_class composite_relation ON composite_relation.oid = type.typrelid
    WHERE type.typelem = 0
      AND (
        type.typtype IN ('b', 'd', 'e', 'r', 'm')
        OR (type.typtype = 'c' AND composite_relation.relkind = 'c')
      )

    UNION ALL
    SELECT
      'policy',
      relation.relname || ':' || policy.polname,
      jsonb_build_object(
        'permissive', policy.polpermissive,
        'command', policy.polcmd,
        'roles', COALESCE((
          SELECT jsonb_agg(role_name ORDER BY role_name)
          FROM (
            SELECT CASE WHEN role_oid = 0 THEN 'public' ELSE role.rolname END AS role_name
            FROM unnest(policy.polroles) role_oid
            LEFT JOIN pg_roles role ON role.oid = role_oid
          ) policy_roles
        ), '[]'::jsonb),
        'using', CASE WHEN policy.polqual IS NULL THEN NULL ELSE
          replace(pg_get_expr(policy.polqual, policy.polrelid, true), target.nspname || '.', '<schema>.')
        END,
        'check', CASE WHEN policy.polwithcheck IS NULL THEN NULL ELSE
          replace(pg_get_expr(policy.polwithcheck, policy.polrelid, true), target.nspname || '.', '<schema>.')
        END
      )::text
    FROM pg_policy policy
    JOIN pg_class relation ON relation.oid = policy.polrelid
    JOIN target ON target.oid = relation.relnamespace

    UNION ALL
    SELECT
      'trigger',
      relation.relname || ':' || trigger.tgname,
      jsonb_build_object(
        'enabled', trigger.tgenabled,
        'deferrable', trigger.tgdeferrable,
        'initiallyDeferred', trigger.tginitdeferred,
        'definition', replace(
          pg_get_triggerdef(trigger.oid, true),
          target.nspname || '.',
          '<schema>.'
        )
      )::text
    FROM pg_trigger trigger
    JOIN pg_class relation ON relation.oid = trigger.tgrelid
    JOIN target ON target.oid = relation.relnamespace
    WHERE NOT trigger.tgisinternal

    UNION ALL
    SELECT
      'rule',
      relation.relname || ':' || rule.rulename,
      jsonb_build_object(
        'enabled', rule.ev_enabled,
        'definition', replace(pg_get_ruledef(rule.oid, true), target.nspname || '.', '<schema>.')
      )::text
    FROM pg_rewrite rule
    JOIN pg_class relation ON relation.oid = rule.ev_class
    JOIN target ON target.oid = relation.relnamespace
    WHERE rule.rulename <> '_RETURN'

    UNION ALL
    SELECT
      'extension',
      extension.extname,
      jsonb_build_object(
        'owner', owner.rolname,
        'version', extension.extversion,
        'relocatable', extension.extrelocatable
      )::text
    FROM pg_extension extension
    JOIN target ON target.oid = extension.extnamespace
    JOIN pg_roles owner ON owner.oid = extension.extowner

    UNION ALL
    SELECT
      'operator',
      operator_object.oprname || '(' || format_type(operator_object.oprleft, NULL) || ','
        || format_type(operator_object.oprright, NULL) || ')',
      jsonb_build_object(
        'owner', owner.rolname,
        'result', format_type(operator_object.oprresult, NULL),
        'procedure', replace(
          operator_object.oprcode::regprocedure::text,
          target.nspname || '.',
          '<schema>.'
        )
      )::text
    FROM pg_operator operator_object
    JOIN target ON target.oid = operator_object.oprnamespace
    JOIN pg_roles owner ON owner.oid = operator_object.oprowner

    UNION ALL
    SELECT
      'operator-family',
      access_method.amname || ':' || family.opfname,
      jsonb_build_object(
        'owner', owner.rolname,
        'accessMethod', access_method.amname
      )::text
    FROM pg_opfamily family
    JOIN target ON target.oid = family.opfnamespace
    JOIN pg_roles owner ON owner.oid = family.opfowner
    JOIN pg_am access_method ON access_method.oid = family.opfmethod

    UNION ALL
    SELECT
      'operator-class',
      access_method.amname || ':' || operator_class.opcname,
      jsonb_build_object(
        'owner', owner.rolname,
        'accessMethod', access_method.amname,
        'family', replace(
          family_namespace.nspname || '.' || family.opfname,
          target.nspname || '.',
          '<schema>.'
        ),
        'inputType', format_type(operator_class.opcintype, NULL),
        'default', operator_class.opcdefault,
        'keyType', CASE WHEN operator_class.opckeytype = 0 THEN NULL
          ELSE format_type(operator_class.opckeytype, NULL) END
      )::text
    FROM pg_opclass operator_class
    JOIN target ON target.oid = operator_class.opcnamespace
    JOIN pg_roles owner ON owner.oid = operator_class.opcowner
    JOIN pg_am access_method ON access_method.oid = operator_class.opcmethod
    JOIN pg_opfamily family ON family.oid = operator_class.opcfamily
    JOIN pg_namespace family_namespace ON family_namespace.oid = family.opfnamespace

    UNION ALL
    SELECT
      'operator-family-member',
      access_method.amname || ':' || family.opfname || ':'
        || operator_member.amopstrategy::text || ':' || operator_member.amoppurpose::text || ':'
        || format_type(operator_member.amoplefttype, NULL) || ':'
        || format_type(operator_member.amoprighttype, NULL),
      jsonb_build_object(
        'operator', replace(
          operator_object.oid::regoperator::text,
          target.nspname || '.',
          '<schema>.'
        ),
        'sortFamily', CASE WHEN sort_family.oid IS NULL THEN NULL ELSE replace(
          sort_family_namespace.nspname || '.' || sort_family.opfname,
          target.nspname || '.',
          '<schema>.'
        ) END
      )::text
    FROM pg_amop operator_member
    JOIN pg_opfamily family ON family.oid = operator_member.amopfamily
    JOIN target ON target.oid = family.opfnamespace
    JOIN pg_am access_method ON access_method.oid = family.opfmethod
    JOIN pg_operator operator_object ON operator_object.oid = operator_member.amopopr
    LEFT JOIN pg_opfamily sort_family ON sort_family.oid = operator_member.amopsortfamily
    LEFT JOIN pg_namespace sort_family_namespace
      ON sort_family_namespace.oid = sort_family.opfnamespace

    UNION ALL
    SELECT
      'operator-family-procedure',
      access_method.amname || ':' || family.opfname || ':'
        || support.amprocnum::text || ':' || format_type(support.amproclefttype, NULL) || ':'
        || format_type(support.amprocrighttype, NULL),
      jsonb_build_object(
        'procedure', replace(
          support.amproc::regprocedure::text,
          target.nspname || '.',
          '<schema>.'
        )
      )::text
    FROM pg_amproc support
    JOIN pg_opfamily family ON family.oid = support.amprocfamily
    JOIN target ON target.oid = family.opfnamespace
    JOIN pg_am access_method ON access_method.oid = family.opfmethod

    UNION ALL
    SELECT
      'collation',
      collation_object.collname,
      jsonb_build_object(
        'owner', owner.rolname,
        'provider', collation_object.collprovider,
        'deterministic', collation_object.collisdeterministic,
        'encoding', collation_object.collencoding,
        'collate', collation_object.collcollate,
        'ctype', collation_object.collctype,
        'version', collation_object.collversion
      )::text
    FROM pg_collation collation_object
    JOIN target ON target.oid = collation_object.collnamespace
    JOIN pg_roles owner ON owner.oid = collation_object.collowner

    UNION ALL
    SELECT
      'conversion',
      conversion.conname,
      jsonb_build_object(
        'owner', owner.rolname,
        'sourceEncoding', conversion.conforencoding,
        'destinationEncoding', conversion.contoencoding,
        'default', conversion.condefault,
        'procedure', replace(conversion.conproc::regprocedure::text, target.nspname || '.', '<schema>.')
      )::text
    FROM pg_conversion conversion
    JOIN target ON target.oid = conversion.connamespace
    JOIN pg_roles owner ON owner.oid = conversion.conowner

    UNION ALL
    SELECT
      'text-search-parser',
      parser.prsname,
      jsonb_build_object(
        'start', replace(parser.prsstart::regproc::text, target.nspname || '.', '<schema>.'),
        'token', replace(parser.prstoken::regproc::text, target.nspname || '.', '<schema>.'),
        'end', replace(parser.prsend::regproc::text, target.nspname || '.', '<schema>.'),
        'headline', CASE WHEN parser.prsheadline = 0 THEN NULL ELSE
          replace(parser.prsheadline::regproc::text, target.nspname || '.', '<schema>.') END,
        'lexTypes', replace(parser.prslextype::regproc::text, target.nspname || '.', '<schema>.')
      )::text
    FROM pg_ts_parser parser
    JOIN target ON target.oid = parser.prsnamespace

    UNION ALL
    SELECT
      'text-search-template',
      template.tmplname,
      jsonb_build_object(
        'init', CASE WHEN template.tmplinit = 0 THEN NULL ELSE
          replace(template.tmplinit::regproc::text, target.nspname || '.', '<schema>.') END,
        'lexize', replace(template.tmpllexize::regproc::text, target.nspname || '.', '<schema>.')
      )::text
    FROM pg_ts_template template
    JOIN target ON target.oid = template.tmplnamespace

    UNION ALL
    SELECT
      'text-search-dictionary',
      dictionary.dictname,
      jsonb_build_object(
        'owner', owner.rolname,
        'template', replace(
          template_namespace.nspname || '.' || template.tmplname,
          target.nspname || '.',
          '<schema>.'
        ),
        'options', dictionary.dictinitoption
      )::text
    FROM pg_ts_dict dictionary
    JOIN target ON target.oid = dictionary.dictnamespace
    JOIN pg_roles owner ON owner.oid = dictionary.dictowner
    JOIN pg_ts_template template ON template.oid = dictionary.dicttemplate
    JOIN pg_namespace template_namespace ON template_namespace.oid = template.tmplnamespace

    UNION ALL
    SELECT
      'text-search-configuration',
      configuration.cfgname,
      jsonb_build_object(
        'owner', owner.rolname,
        'parser', replace(
          parser_namespace.nspname || '.' || parser.prsname,
          target.nspname || '.',
          '<schema>.'
        ),
        'mappings', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'tokenType', mapping.maptokentype,
              'sequence', mapping.mapseqno,
              'dictionary', replace(
                dictionary_namespace.nspname || '.' || dictionary.dictname,
                target.nspname || '.',
                '<schema>.'
              )
            ) ORDER BY mapping.maptokentype, mapping.mapseqno
          )
          FROM pg_ts_config_map mapping
          JOIN pg_ts_dict dictionary ON dictionary.oid = mapping.mapdict
          JOIN pg_namespace dictionary_namespace
            ON dictionary_namespace.oid = dictionary.dictnamespace
          WHERE mapping.mapcfg = configuration.oid
        ), '[]'::jsonb)
      )::text
    FROM pg_ts_config configuration
    JOIN target ON target.oid = configuration.cfgnamespace
    JOIN pg_roles owner ON owner.oid = configuration.cfgowner
    JOIN pg_ts_parser parser ON parser.oid = configuration.cfgparser
    JOIN pg_namespace parser_namespace ON parser_namespace.oid = parser.prsnamespace

    UNION ALL
    SELECT
      'statistics',
      statistics.stxname,
      jsonb_build_object(
        'owner', owner.rolname,
        'kinds', to_jsonb(statistics.stxkind),
        'definition', replace(
          pg_get_statisticsobjdef(statistics.oid),
          target.nspname || '.',
          '<schema>.'
        )
      )::text
    FROM pg_statistic_ext statistics
    JOIN target ON target.oid = statistics.stxnamespace
    JOIN pg_roles owner ON owner.oid = statistics.stxowner
  )
  SELECT category, identity, definition
  FROM fingerprint
  ORDER BY category, identity, definition
`;

async function createLedgerTable(
  client: PoolClient,
  temporary: boolean,
): Promise<void> {
  await client.query(`
    CREATE ${temporary ? "TEMP " : ""}TABLE IF NOT EXISTS ${temporary ? "" : "portfolio."}schema_migrations (
      filename text PRIMARY KEY,
      journal_timestamp bigint NOT NULL UNIQUE,
      checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
      applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
    )
  `);
}

async function schemaFingerprint(
  client: PoolClient,
  schemaOid: string,
  searchPath: string,
  expectedSchemaOwner: string,
): Promise<FingerprintRow[]> {
  await client.query(`SET LOCAL search_path = ${searchPath}`);
  const result = await client.query<FingerprintRow>(SCHEMA_FINGERPRINT_SQL, [
    schemaOid,
    expectedSchemaOwner,
  ]);
  if (
    result.rows.some(
      (row) =>
        typeof row.category !== "string" ||
        typeof row.identity !== "string" ||
        typeof row.definition !== "string",
    )
  ) {
    throw new Error("Portfolio schema fingerprint evidence was malformed");
  }
  return result.rows.map((row) => ({
    ...row,
    definition: searchPath === EXPECTED_SEARCH_PATH
      ? row.definition.replaceAll("pg_temp.", "<schema>.")
      : row.definition,
  }));
}

function fingerprintDigest(rows: readonly FingerprintRow[]): string {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

async function assertSchemaFingerprint(
  client: PoolClient,
  actualSchemaOid: string,
  expectedSchemaOid: string,
  migrationCount: number,
): Promise<void> {
  const expectedSchemaOwner = "portfolio_migrator";
  const actual = await schemaFingerprint(
    client,
    actualSchemaOid,
    ACTUAL_SEARCH_PATH,
    expectedSchemaOwner,
  );
  const expected = await schemaFingerprint(
    client,
    expectedSchemaOid,
    EXPECTED_SEARCH_PATH,
    expectedSchemaOwner,
  );
  const actualDigest = fingerprintDigest(actual);
  const expectedDigest = fingerprintDigest(expected);
  if (actualDigest !== expectedDigest) {
    const firstDifferences: string[] = [];
    for (
      let index = 0;
      index < Math.max(actual.length, expected.length);
      index++
    ) {
      const actualRow = actual[index];
      const expectedRow = expected[index];
      if (JSON.stringify(actualRow) === JSON.stringify(expectedRow)) continue;
      firstDifferences.push(
        `${actualRow?.category ?? "missing"}:${actualRow?.identity ?? "missing"}` +
          `!=${expectedRow?.category ?? "missing"}:${expectedRow?.identity ?? "missing"}`,
      );
      if (firstDifferences.length === 3) break;
    }
    throw new Error(
      `Portfolio schema fingerprint drift after ${migrationCount} migrations: ` +
        `actual=${actualDigest}/${actual.length} expected=${expectedDigest}/${expected.length}; ` +
        firstDifferences.join(", "),
    );
  }
}

async function applyStatements(
  client: PoolClient,
  migrations: readonly PortfolioMigration[],
): Promise<void> {
  for (const migration of migrations) {
    for (const statement of migration.statements) await client.query(statement);
  }
}

async function insertLedgerRow(
  client: PoolClient,
  migration: PortfolioMigration,
): Promise<void> {
  await client.query(
    `INSERT INTO portfolio.schema_migrations
       (filename, journal_timestamp, checksum)
     VALUES ($1, $2::bigint, $3)`,
    [
      migration.filename,
      String(migration.journalTimestamp),
      migration.checksum,
    ],
  );
}

export async function applyPortfolioMigrations(
  client: PoolClient,
  plan: readonly PortfolioMigration[],
  options: { allowSchemaBootstrap: boolean },
): Promise<MigrationResult> {
  await client.query("BEGIN");
  try {
    await client.query(
      `SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_ID}::bigint)`,
    );
    const schema = await client.query<{ exists: boolean }>(
      "SELECT to_regnamespace('portfolio') IS NOT NULL AS exists",
    );
    if (!schema.rows[0]?.exists) {
      if (!options.allowSchemaBootstrap) {
        throw new Error(
          "Portfolio schema must be provisioned before a production migration",
        );
      }
      await client.query(
        "CREATE SCHEMA portfolio AUTHORIZATION portfolio_migrator",
      );
    }

    const vectorExtensionExists = await client.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS exists",
    );
    if (!vectorExtensionExists.rows[0]?.exists) {
      if (!options.allowSchemaBootstrap) {
        throw new Error(
          "The vector extension must be provisioned in extensions before production migration",
        );
      }
      await client.query("CREATE SCHEMA IF NOT EXISTS extensions");
      await client.query("CREATE EXTENSION vector WITH SCHEMA extensions");
    }
    const vectorExtension = await client.query<{
      schemaName: string;
      owner: string;
      version: string;
      defaultVersion: string;
      relocatable: boolean;
    }>(`
      SELECT
        namespace.nspname AS "schemaName",
        owner.rolname AS owner,
        extension.extversion AS version,
        available.default_version AS "defaultVersion",
        extension.extrelocatable AS relocatable
      FROM pg_extension extension
      JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace
      JOIN pg_roles owner ON owner.oid = extension.extowner
      JOIN pg_available_extensions available ON available.name = extension.extname
      WHERE extension.extname = 'vector'
    `);
    if (
      vectorExtension.rows.length !== 1 ||
      vectorExtension.rows[0]?.schemaName !== "extensions" ||
      vectorExtension.rows[0]?.owner !== VECTOR_EXTENSION_OWNER ||
      vectorExtension.rows[0]?.version !==
        vectorExtension.rows[0]?.defaultVersion ||
      vectorExtension.rows[0]?.relocatable !== true
    ) {
      throw new Error(
        `The vector extension must be isolated in extensions, owned by ${VECTOR_EXTENSION_OWNER}, ` +
          "relocatable, and installed at the platform default version",
      );
    }

    await client.query("SET LOCAL search_path = portfolio, extensions");
    await createLedgerTable(client, false);

    const canonical = await client.query<CanonicalLedgerRow>(`
      SELECT
        filename,
        journal_timestamp::text AS "journalTimestamp",
        checksum
      FROM portfolio.schema_migrations
    `);
    const completed = assertCanonicalLedgerPrefix(plan, canonical.rows);
    const adopted = 0;

    const actualSchema = await client.query<{ oid: string | null }>(
      "SELECT to_regnamespace('portfolio')::oid::text AS oid",
    );
    if (!actualSchema.rows[0]?.oid || !/^\d+$/.test(actualSchema.rows[0].oid)) {
      throw new Error(
        "Portfolio schema fingerprint could not resolve the target schema",
      );
    }

    await client.query(`SET LOCAL search_path = ${EXPECTED_SEARCH_PATH}`);
    await createLedgerTable(client, true);
    await applyStatements(client, plan.slice(0, completed));
    const expectedSchema = await client.query<{ oid: string }>(
      "SELECT pg_my_temp_schema()::oid::text AS oid",
    );
    if (
      !expectedSchema.rows[0]?.oid ||
      !/^[1-9]\d*$/.test(expectedSchema.rows[0].oid)
    ) {
      throw new Error(
        "Portfolio schema fingerprint could not create its temporary expected schema",
      );
    }
    await assertSchemaFingerprint(
      client,
      actualSchema.rows[0].oid,
      expectedSchema.rows[0].oid,
      completed,
    );

    let applied = 0;
    for (let index = completed; index < plan.length; index++) {
      const migration = plan[index];
      await client.query(`SET LOCAL search_path = ${ACTUAL_SEARCH_PATH}`);
      await applyStatements(client, [migration]);
      await insertLedgerRow(client, migration);
      await client.query(`SET LOCAL search_path = ${EXPECTED_SEARCH_PATH}`);
      await applyStatements(client, [migration]);
      applied++;
    }
    if (applied > 0) {
      await assertSchemaFingerprint(
        client,
        actualSchema.rows[0].oid,
        expectedSchema.rows[0].oid,
        plan.length,
      );
    }
    await client.query("DISCARD TEMP");
    await client.query("SET LOCAL search_path = portfolio, extensions");
    await client.query("COMMIT");
    return { adopted, applied, total: plan.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
