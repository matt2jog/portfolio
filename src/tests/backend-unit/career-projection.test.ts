import { test } from "node:test";
import assert from "node:assert/strict";
import {
  experiences,
  projects,
  xyzBullets,
  education,
  allSkills,
} from "../../shared/schema";
import {
  projectExperience,
  projectProject,
  projectEducation,
  projectSkill,
  projectProfile,
  type Db,
} from "../../backend/consumers/career-projection";
import { parseEnvelope } from "../../backend/consumers/career-events-types";

// ---- recording adapter/double ------------------------------------------------
//
// Records every insert/update/delete call the projection logic makes so tests can
// assert exactly which columns were written, without touching a real Postgres pool.
// Kept intentionally structural (not a typed drizzle stand-in) — production code casts
// the real `db` in; tests cast this mock the other way (`as unknown as Db`).

interface RecordedCall {
  op: "insert" | "update" | "delete";
  table: unknown;
  values?: any;
  set?: any;
  onConflictDoUpdate?: { target: unknown; set: any };
}

function createMockDb() {
  const calls: RecordedCall[] = [];

  const mock = {
    insert(table: unknown) {
      const call: RecordedCall = { op: "insert", table };
      calls.push(call);
      return {
        values(values: any) {
          call.values = values;
          const result: any = Promise.resolve(undefined);
          result.onConflictDoUpdate = (cfg: { target: unknown; set: any }) => {
            call.onConflictDoUpdate = cfg;
            return Promise.resolve(undefined);
          };
          return result;
        },
      };
    },
    update(table: unknown) {
      const call: RecordedCall = { op: "update", table };
      calls.push(call);
      return {
        set(values: any) {
          call.set = values;
          return {
            where(_cond: unknown) {
              return Promise.resolve(undefined);
            },
          };
        },
      };
    },
    delete(table: unknown) {
      const call: RecordedCall = { op: "delete", table };
      calls.push(call);
      return {
        where(_cond: unknown) {
          return Promise.resolve(undefined);
        },
      };
    },
  };

  return { db: mock as unknown as Db, calls };
}

function silentLogger() {
  return { debug() {}, info() {}, warn() {} };
}

// ── experience projection ────────────────────────────────────────────────────

test("projectExperience: upsert includes position in values but omits it from the update set (position applied on INSERT only)", async () => {
  const { db, calls } = createMockDb();

  await projectExperience(
    db,
    {
      event_id: "e1",
      event_type: "ExperienceUpserted",
      aggregate_id: "exp-1",
      occurred_at: "2026-01-01T00:00:00Z",
      actor: "human",
      sequence: 1,
      data: {
        id: "exp-1",
        role: "Engineer",
        company: "Acme",
        location: "Remote",
        duration: "2024-2025",
        description: "Built things",
        technologies: ["ts", "postgres"],
        is_active: true,
        position: 7,
      },
    },
    silentLogger(),
  );

  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.equal(call.op, "insert");
  assert.equal(call.table, experiences);
  assert.equal(call.values.id, "exp-1");
  assert.equal(call.values.position, 7);
  assert.ok(call.onConflictDoUpdate, "expected onConflictDoUpdate to be called");
  assert.equal(call.onConflictDoUpdate!.target, experiences.id);
  assert.equal(call.onConflictDoUpdate!.set.role, "Engineer");
  assert.equal(
    "position" in call.onConflictDoUpdate!.set,
    false,
    "position must not be part of the update set — it is INSERT-only",
  );
});

test("projectExperience: ExperienceDeleted deletes the row by id (no bullets touched)", async () => {
  const { db, calls } = createMockDb();

  await projectExperience(
    db,
    {
      event_id: "e2",
      event_type: "ExperienceDeleted",
      aggregate_id: "exp-1",
      occurred_at: "2026-01-01T00:00:00Z",
      actor: "human",
      sequence: 2,
      data: null,
    },
    silentLogger(),
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].op, "delete");
  assert.equal(calls[0].table, experiences);
});

test("projectExperience: missing optional fields map to stable projection defaults", async () => {
  const { db, calls } = createMockDb();

  await projectExperience(
    db,
    {
      event_id: "e-defaults",
      event_type: "ExperienceUpserted",
      aggregate_id: "exp-defaults",
      occurred_at: "2026-01-01T00:00:00Z",
      actor: "human",
      sequence: 1,
      data: { id: "exp-defaults", role: "Engineer", company: "Acme" },
    },
    silentLogger(),
  );

  assert.deepEqual(calls[0].values, {
    id: "exp-defaults",
    role: "Engineer",
    company: "Acme",
    location: "Remote",
    duration: "",
    description: "",
    technologies: [],
    isActive: false,
    position: 0,
  });
});

test("projectExperience: tombstone (data: null without an explicit Deleted event_type) also deletes", async () => {
  const { db, calls } = createMockDb();

  await projectExperience(
    db,
    {
      event_id: "tombstone",
      event_type: "ExperienceDeleted",
      aggregate_id: "exp-9",
      occurred_at: "2026-01-01T00:00:00Z",
      actor: "system:kafka-tombstone",
      sequence: 0,
      data: null,
    },
    silentLogger(),
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].op, "delete");
});

// ── project projection (+ bullets) ───────────────────────────────────────────

test("projectProject: upsert writes content fields, a category sentinel only in values (never in the update set), and replaces bullets by id", async () => {
  const { db, calls } = createMockDb();

  await projectProject(
    db,
    {
      event_id: "p1",
      event_type: "ProjectUpserted",
      aggregate_id: "proj-1",
      occurred_at: "2026-01-01T00:00:00Z",
      actor: "human",
      sequence: 1,
      data: {
        id: "proj-1",
        title: "Cool Project",
        description: "Does cool things",
        long_description: "Even cooler in detail",
        tech: ["ts"],
        deployed_url: "https://example.com",
        github_url: "https://github.com/example/example",
        position: 3,
        bullets: [
          { id: "b2", text: "Second bullet", position: 2 },
          { id: "b1", text: "First bullet", position: 1 },
        ],
      },
    },
    silentLogger(),
  );

  assert.equal(calls.length, 3);

  const [upsertCall, deleteBulletsCall, insertBulletsCall] = calls;

  assert.equal(upsertCall.op, "insert");
  assert.equal(upsertCall.table, projects);
  assert.equal(upsertCall.values.id, "proj-1");
  assert.equal(upsertCall.values.position, 3);
  assert.equal(upsertCall.values.category, "uncategorized");
  assert.ok(upsertCall.onConflictDoUpdate);
  assert.equal("position" in upsertCall.onConflictDoUpdate!.set, false);
  assert.equal("category" in upsertCall.onConflictDoUpdate!.set, false);
  assert.equal("image" in upsertCall.onConflictDoUpdate!.set, false);
  assert.equal("hoverImage" in upsertCall.onConflictDoUpdate!.set, false);

  assert.equal(deleteBulletsCall.op, "delete");
  assert.equal(deleteBulletsCall.table, xyzBullets);

  assert.equal(insertBulletsCall.op, "insert");
  assert.equal(insertBulletsCall.table, xyzBullets);
  // Bullets are re-ordered by their event-supplied position before insertion, and IDs
  // come from the event (never DB-generated) so replays stay idempotent.
  assert.deepEqual(
    insertBulletsCall.values.map((b: any) => b.id),
    ["b1", "b2"],
  );
  assert.equal(insertBulletsCall.values[0].projectId, "proj-1");
  assert.equal(insertBulletsCall.values[0].bulletText, "First bullet");
});

test("projectProject: upsert with no bullets still clears any existing bullets and skips the insert", async () => {
  const { db, calls } = createMockDb();

  await projectProject(
    db,
    {
      event_id: "p2",
      event_type: "ProjectUpserted",
      aggregate_id: "proj-2",
      occurred_at: "2026-01-01T00:00:00Z",
      actor: "human",
      sequence: 1,
      data: { id: "proj-2", title: "No Bullets Project" },
    },
    silentLogger(),
  );

  assert.equal(calls.length, 2);
  assert.equal(calls[0].op, "insert");
  assert.equal(calls[1].op, "delete");
  assert.equal(calls[1].table, xyzBullets);
});

test("projectProject: ProjectDeleted soft-deletes (archives) rather than hard-deleting", async () => {
  const { db, calls } = createMockDb();

  await projectProject(
    db,
    {
      event_id: "p3",
      event_type: "ProjectDeleted",
      aggregate_id: "proj-1",
      occurred_at: "2026-01-01T00:00:00Z",
      actor: "human",
      sequence: 2,
      data: null,
    },
    silentLogger(),
  );

  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.equal(call.op, "update");
  assert.equal(call.table, projects);
  assert.ok(call.set.deletedAt instanceof Date);
  assert.equal(call.set.archivedBy, "system:career-events");
});

// ── education projection ─────────────────────────────────────────────────────

test("projectEducation: upsert includes position in values but omits it from the update set", async () => {
  const { db, calls } = createMockDb();

  await projectEducation(
    db,
    {
      event_id: "ed1",
      event_type: "EducationUpserted",
      aggregate_id: "edu-1",
      occurred_at: "2026-01-01T00:00:00Z",
      actor: "human",
      sequence: 1,
      data: {
        id: "edu-1",
        school: "State University",
        location: "NJ",
        degree: "B.S. Computer Science",
        dates: "2018-2022",
        position: 2,
      },
    },
    silentLogger(),
  );

  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.equal(call.table, education);
  assert.equal(call.values.position, 2);
  assert.equal("position" in call.onConflictDoUpdate!.set, false);
});

test("projectEducation: EducationDeleted hard-deletes the row (no soft-delete column on this table)", async () => {
  const { db, calls } = createMockDb();

  await projectEducation(
    db,
    {
      event_id: "ed2",
      event_type: "EducationDeleted",
      aggregate_id: "edu-1",
      occurred_at: "2026-01-01T00:00:00Z",
      actor: "human",
      sequence: 2,
      data: null,
    },
    silentLogger(),
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].op, "delete");
  assert.equal(calls[0].table, education);
});

// ── skill projection ──────────────────────────────────────────────────────────

test("projectSkill: matches an existing all_skills row via legacy_all_skill_id", async () => {
  const { db, calls } = createMockDb();

  await projectSkill(
    db,
    {
      event_id: "s1",
      event_type: "SkillConceptUpserted",
      aggregate_id: "concept-1",
      occurred_at: "2026-01-01T00:00:00Z",
      actor: "human",
      sequence: 1,
      data: {
        id: "concept-1",
        name: "Python",
        variants: [
          { id: "variant-1", wording: "Python 3", is_default: true, legacy_all_skill_id: "legacy-all-skill-1" },
        ],
      },
    },
    silentLogger(),
  );

  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.equal(call.table, allSkills);
  assert.equal(call.values.id, "legacy-all-skill-1", "must use the legacy id, not the new variant id");
  assert.equal(call.values.name, "Python 3");
  assert.equal(call.onConflictDoUpdate!.target, allSkills.id);
  assert.deepEqual(Object.keys(call.onConflictDoUpdate!.set), ["name"]);
});

test("projectSkill: falls back to the variant id as the new all_skills.id when there is no legacy match", async () => {
  const { db, calls } = createMockDb();

  await projectSkill(
    db,
    {
      event_id: "s2",
      event_type: "SkillConceptUpserted",
      aggregate_id: "concept-2",
      occurred_at: "2026-01-01T00:00:00Z",
      actor: "human",
      sequence: 1,
      data: {
        id: "concept-2",
        name: "Rust",
        variants: [{ id: "variant-2", wording: "Rust", is_default: true }],
      },
    },
    silentLogger(),
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].values.id, "variant-2");
  assert.equal(calls[0].values.name, "Rust");
});

test("projectSkill: multiple variants each produce their own upsert call", async () => {
  const { db, calls } = createMockDb();

  await projectSkill(
    db,
    {
      event_id: "s3",
      event_type: "SkillConceptUpserted",
      aggregate_id: "concept-3",
      occurred_at: "2026-01-01T00:00:00Z",
      actor: "human",
      sequence: 1,
      data: {
        id: "concept-3",
        name: "JS",
        variants: [
          { id: "variant-3a", wording: "JavaScript", is_default: true },
          { id: "variant-3b", wording: "JS", is_default: false, legacy_all_skill_id: "legacy-js" },
        ],
      },
    },
    silentLogger(),
  );

  assert.equal(calls.length, 2);
  assert.equal(calls[0].values.id, "variant-3a");
  assert.equal(calls[1].values.id, "legacy-js");
});

test("projectSkill: SkillConceptDeleted logs a warning only — no all_skills deletes in v1", async () => {
  const { db, calls } = createMockDb();
  const warnings: string[] = [];

  await projectSkill(
    db,
    {
      event_id: "s4",
      event_type: "SkillConceptDeleted",
      aggregate_id: "concept-1",
      occurred_at: "2026-01-01T00:00:00Z",
      actor: "human",
      sequence: 2,
      data: null,
    },
    { debug() {}, info() {}, warn: (msg) => warnings.push(msg) },
  );

  assert.equal(calls.length, 0, "no db writes should occur on a skill concept delete");
  assert.equal(warnings.length, 1);
});

// ── profile projection (no-op) ────────────────────────────────────────────────

test("projectProfile: legacy payload is a no-op pending Admin's generated projection schema", () => {
  const debugMessages: string[] = [];
  assert.doesNotThrow(() =>
    projectProfile(
      {
        event_id: "pr1",
        event_type: "ProfileUpserted",
        aggregate_id: "profile",
        occurred_at: "2026-01-01T00:00:00Z",
        actor: "human",
        sequence: 1,
        data: { name: "Matthew", email: "matthew@2jog.dev" },
      },
      { debug: (msg) => debugMessages.push(msg), info() {}, warn() {} },
    ),
  );
  assert.equal(debugMessages.length, 1);
});

// ── envelope parsing (wire format tolerance) ─────────────────────────────────

test("parseEnvelope: parses a plain JSON envelope", () => {
  const raw = Buffer.from(
    JSON.stringify({
      event_id: "e1",
      event_type: "ExperienceUpserted",
      aggregate_id: "exp-1",
      occurred_at: "2026-01-01T00:00:00Z",
      actor: "human",
      sequence: 1,
      data: { id: "exp-1", role: "Engineer", company: "Acme" },
    }),
  );

  const envelope = parseEnvelope(raw);
  assert.ok(envelope);
  assert.equal(envelope!.event_id, "e1");
  assert.equal(envelope!.aggregate_id, "exp-1");
});

test("parseEnvelope: rejects obsolete schema-registry framing", () => {
  const json = JSON.stringify({
    event_id: "e2",
    event_type: "ProjectUpserted",
    aggregate_id: "proj-1",
    occurred_at: "2026-01-01T00:00:00Z",
    actor: "human",
    sequence: 1,
    data: { id: "proj-1", title: "Framed" },
  });
  const framed = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x00, 0x07]), Buffer.from(json)]);

  assert.equal(parseEnvelope(framed), null);
});

test("parseEnvelope: returns null for a tombstone (null value)", () => {
  assert.equal(parseEnvelope(null), null);
  assert.equal(parseEnvelope(Buffer.alloc(0)), null);
});

test("parseEnvelope: returns null for malformed JSON instead of throwing", () => {
  assert.doesNotThrow(() => parseEnvelope(Buffer.from("{not json")));
  assert.equal(parseEnvelope(Buffer.from("{not json")), null);
});

test("parseEnvelope: returns null when required envelope fields are missing", () => {
  const raw = Buffer.from(JSON.stringify({ foo: "bar" }));
  assert.equal(parseEnvelope(raw), null);
  assert.equal(parseEnvelope(Buffer.from("[]")), null);
});
