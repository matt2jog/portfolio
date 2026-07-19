import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { eq, inArray } from "drizzle-orm";
import {
  CAREER_CONSUMER,
  createPostgresCareerEventStore,
  parseCareerPubSubPush,
  processCareerDelivery,
  type CareerDelivery,
} from "../../backend/consumers/career-pubsub";
import { withDatabaseAuditContext } from "../../backend/data/database-audit";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for career Pub/Sub integration tests");
}
process.env.DATABASE_URL = databaseUrl;

const { db, pool } = await import("../../backend/data/db");
const { experiences } = await import("../../shared/schema");

after(async () => {
  await pool.end();
});

const SUBSCRIPTION = "projects/personal-brand-501801/subscriptions/portfolio-career-integration";

function withServiceAuditContext<T>(operation: string, run: () => T): T {
  const requestId = randomUUID();
  return withDatabaseAuditContext({
    requestId,
    traceId: requestId,
    actorKind: "gcp-service",
    actorId: "portfolio-career-push@personal-brand-501801.iam.gserviceaccount.com",
    operation,
    correlationId: null,
    causationId: null,
    releaseId: "integration-test",
    authenticationAssertionDigest: "a".repeat(64),
  }, run);
}

function deliver(
  store: ReturnType<typeof createPostgresCareerEventStore>,
  incoming: CareerDelivery,
) {
  return withServiceAuditContext(
    "consume-career-event",
    () => processCareerDelivery(store, incoming),
  );
}

function event(args: {
  eventId: string;
  aggregateId: string;
  sequence: number;
  eventType?: "ExperienceUpserted" | "ExperienceDeleted";
  role?: string;
}) {
  const eventType = args.eventType ?? "ExperienceUpserted";
  return {
    event_id: args.eventId,
    event_type: eventType,
    aggregate_id: args.aggregateId,
    occurred_at: "2026-07-15T12:00:00.000Z",
    actor: "integration@example.invalid",
    sequence: args.sequence,
    data: eventType === "ExperienceDeleted"
      ? null
      : {
        id: args.aggregateId,
        role: args.role ?? `Role ${args.sequence}`,
        company: "Integration",
      },
  };
}

function delivery(inner: ReturnType<typeof event>, messageId = randomUUID()): CareerDelivery {
  const parsed = parseCareerPubSubPush({
    deliveryAttempt: 1,
    message: {
      attributes: {
        contract_version: "1",
        event_type: inner.event_type,
        producer_release: "integration-fixture",
      },
      data: Buffer.from(JSON.stringify(inner), "utf8").toString("base64"),
      messageId,
      orderingKey: inner.aggregate_id,
      publishTime: "2026-07-15T12:00:01.000Z",
    },
    subscription: SUBSCRIPTION,
  }, SUBSCRIPTION);
  return {
    ...parsed,
    authenticatedPrincipal:
      "portfolio-career-push@personal-brand-501801.iam.gserviceaccount.com",
    authenticationAssertionDigest: "a".repeat(64),
  };
}

async function cleanup(aggregateIds: string[], eventIds: string[]): Promise<void> {
  await withServiceAuditContext("integration-cleanup", async () => {
    await pool.query(
      "DELETE FROM portfolio.career_event_quarantine WHERE consumer = $1 AND event_id = ANY($2::text[])",
      [CAREER_CONSUMER, eventIds],
    );
    await pool.query(
      "DELETE FROM portfolio.career_event_inbox WHERE consumer = $1 AND event_id = ANY($2::text[])",
      [CAREER_CONSUMER, eventIds],
    );
    await pool.query(
      "DELETE FROM portfolio.career_event_checkpoints WHERE consumer = $1 AND aggregate_id = ANY($2::text[])",
      [CAREER_CONSUMER, aggregateIds],
    );
    await db.delete(experiences).where(inArray(experiences.id, aggregateIds));
  });
}

test("Postgres atomically dedupes, quarantines conflicts, versions, projects, and checkpoints", async () => {
  const aggregateId = `pubsub-${randomUUID()}`;
  const firstId = randomUUID();
  const secondId = randomUUID();
  const thirdId = randomUUID();
  const staleId = randomUUID();
  const deleteId = randomUUID();
  const eventIds = [firstId, secondId, thirdId, staleId, deleteId];
  const store = createPostgresCareerEventStore(db);

  await cleanup([aggregateId], eventIds);
  try {
    const first = delivery(event({ eventId: firstId, aggregateId, sequence: 1, role: "First" }));
    assert.equal(await deliver(store, first), "applied");
    assert.equal(await deliver(store, first), "duplicate");

    const conflicting = delivery(event({
      eventId: firstId,
      aggregateId,
      sequence: 1,
      role: "Conflicting",
    }));
    assert.equal(await deliver(store, conflicting), "quarantined");
    assert.equal((await pool.query(
      "SELECT count(*)::int AS count FROM portfolio.career_event_quarantine WHERE consumer = $1 AND event_id = $2",
      [CAREER_CONSUMER, firstId],
    )).rows[0].count, 1);

    const third = delivery(event({ eventId: thirdId, aggregateId, sequence: 3, role: "Third" }));
    assert.equal(await deliver(store, third), "version-gap");
    assert.equal((await pool.query(
      "SELECT status FROM portfolio.career_event_inbox WHERE consumer = $1 AND event_id = $2",
      [CAREER_CONSUMER, thirdId],
    )).rows[0].status, "version_gap");

    const second = delivery(event({ eventId: secondId, aggregateId, sequence: 2, role: "Second" }));
    assert.equal(await deliver(store, second), "applied");
    assert.equal(await deliver(store, third), "applied");

    const stale = delivery(event({ eventId: staleId, aggregateId, sequence: 2, role: "Stale" }));
    assert.equal(await deliver(store, stale), "stale-version");

    const [projected] = await db
      .select({ role: experiences.role })
      .from(experiences)
      .where(eq(experiences.id, aggregateId));
    assert.equal(projected.role, "Third");
    assert.deepEqual((await pool.query(
      `SELECT aggregate_version::int AS version, event_id AS "eventId"
       FROM portfolio.career_event_checkpoints
       WHERE consumer = $1 AND aggregate_id = $2`,
      [CAREER_CONSUMER, aggregateId],
    )).rows, [{ version: 3, eventId: thirdId }]);

    const deleted = delivery(event({
      eventId: deleteId,
      aggregateId,
      sequence: 4,
      eventType: "ExperienceDeleted",
    }));
    assert.equal(await deliver(store, deleted), "applied");
    assert.equal((await db.select().from(experiences).where(eq(experiences.id, aggregateId))).length, 0);
  } finally {
    await cleanup([aggregateId], eventIds);
  }
});

test("a crash before commit leaves no inbox, projection, or checkpoint effects", async () => {
  const aggregateId = `pubsub-crash-${randomUUID()}`;
  const eventId = randomUUID();
  const incoming = delivery(event({ eventId, aggregateId, sequence: 1, role: "Rollback" }));
  const store = createPostgresCareerEventStore(db, async (transaction, envelope) => {
    const data = envelope.data as { id: string; role: string; company: string };
    await transaction.insert(experiences).values({
      id: data.id,
      role: data.role,
      company: data.company,
      location: "",
      duration: "",
      description: "",
      technologies: [],
      isActive: false,
    });
    throw new Error("simulated crash before commit");
  });

  await cleanup([aggregateId], [eventId]);
  try {
    await assert.rejects(deliver(store, incoming), /simulated crash/);
    assert.equal((await db.select().from(experiences).where(eq(experiences.id, aggregateId))).length, 0);
    assert.equal((await pool.query(
      "SELECT count(*)::int AS count FROM portfolio.career_event_inbox WHERE consumer = $1 AND event_id = $2",
      [CAREER_CONSUMER, eventId],
    )).rows[0].count, 0);
    assert.equal((await pool.query(
      "SELECT count(*)::int AS count FROM portfolio.career_event_checkpoints WHERE consumer = $1 AND aggregate_id = $2",
      [CAREER_CONSUMER, aggregateId],
    )).rows[0].count, 0);
  } finally {
    await cleanup([aggregateId], [eventId]);
  }
});
