import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { generateKeyPair, SignJWT } from "jose";
import {
  createCareerPubSubHandler,
  parseCareerPubSubPush,
  processCareerDelivery,
  type CareerDelivery,
  type CareerEventStore,
  type CareerEventTransaction,
} from "../../backend/consumers/career-pubsub";
import {
  verifyCareerPushIdentity,
  type CareerPushIdentityConfig,
} from "../../backend/consumers/career-pubsub-auth";

const SUBSCRIPTION = "projects/personal-brand-501801/subscriptions/portfolio-career-prod";
const AUDIENCE = "https://portfolio--prod-us-east4.a.run.app/internal/pubsub/career";
const PUSH_IDENTITY = "portfolio-career-push@personal-brand-501801.iam.gserviceaccount.com";

function careerEvent(overrides: Record<string, unknown> = {}) {
  return {
    event_id: "event-1",
    event_type: "ExperienceUpserted",
    aggregate_id: "experience-1",
    occurred_at: "2026-07-15T12:00:00.000Z",
    actor: "admin@example.invalid",
    sequence: 1,
    data: {
      id: "experience-1",
      role: "Engineer",
      company: "Example",
    },
    ...overrides,
  };
}

function pushEnvelope(
  event = careerEvent(),
  overrides: Record<string, unknown> = {},
) {
  return {
    deliveryAttempt: 1,
    message: {
      attributes: {
        contract_version: "1",
        event_type: event.event_type,
        producer_release: "release-fixture",
      },
      data: Buffer.from(JSON.stringify(event), "utf8").toString("base64"),
      messageId: "message-1",
      orderingKey: event.aggregate_id,
      publishTime: "2026-07-15T12:00:01.000Z",
    },
    subscription: SUBSCRIPTION,
    ...overrides,
  };
}

test("parses the standard wrapped Pub/Sub envelope without changing inner career data", () => {
  const original = careerEvent();
  const raw = Buffer.from(JSON.stringify(original), "utf8");
  const delivery = parseCareerPubSubPush(pushEnvelope(original), SUBSCRIPTION);

  assert.deepEqual(delivery.event, original);
  assert.equal(delivery.payloadDigest, createHash("sha256").update(raw).digest("hex"));
  assert.equal(delivery.messageId, "message-1");
  assert.equal(delivery.deliveryAttempt, 1);
  assert.equal(delivery.replayEpoch, null);
});

test("rejects malformed base64, JSON, event schema, and transport metadata", () => {
  const malformedBase64 = pushEnvelope();
  (malformedBase64.message as { data: string }).data = "%%%not-base64%%%";
  assert.throws(() => parseCareerPubSubPush(malformedBase64, SUBSCRIPTION), /base64/i);

  const malformedJson = pushEnvelope();
  (malformedJson.message as { data: string }).data = Buffer.from("{", "utf8").toString("base64");
  assert.throws(() => parseCareerPubSubPush(malformedJson, SUBSCRIPTION), /JSON/i);

  const malformedSchema = pushEnvelope(careerEvent({ sequence: 0 }));
  assert.throws(() => parseCareerPubSubPush(malformedSchema, SUBSCRIPTION), /schema|sequence/i);

  const wrongOrderingKey = pushEnvelope();
  (wrongOrderingKey.message as { orderingKey: string }).orderingKey = "another-aggregate";
  assert.throws(() => parseCareerPubSubPush(wrongOrderingKey, SUBSCRIPTION), /ordering/i);

  const wrongEventType = pushEnvelope();
  (wrongEventType.message as { attributes: Record<string, string> }).attributes.event_type = "ProjectUpserted";
  assert.throws(() => parseCareerPubSubPush(wrongEventType, SUBSCRIPTION), /event_type/i);
});

test("rejects another subscription and forwarded dead-letter input", () => {
  assert.throws(
    () => parseCareerPubSubPush(pushEnvelope(), "projects/personal-brand-501801/subscriptions/candidate"),
    /subscription/i,
  );

  const deadLetter = pushEnvelope();
  (deadLetter.message as { attributes: Record<string, string> }).attributes.CloudPubSubDeadLetterSourceSubscription = SUBSCRIPTION;
  assert.throws(() => parseCareerPubSubPush(deadLetter, SUBSCRIPTION), /dead.?letter/i);
});

test("accepts a bounded replay epoch while preserving the original event id and digest", () => {
  const replay = pushEnvelope();
  (replay.message as { attributes: Record<string, string> }).attributes.replay_epoch = "2";
  (replay.message as { messageId: string }).messageId = "replay-message";

  const delivery = parseCareerPubSubPush(replay, SUBSCRIPTION);
  assert.equal(delivery.event.event_id, "event-1");
  assert.equal(delivery.replayEpoch, 2);
  assert.equal(delivery.messageId, "replay-message");
});

test("verifies Google OIDC audience and the one allowed push principal", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const config: CareerPushIdentityConfig = {
    audience: AUDIENCE,
    serviceAccountEmail: PUSH_IDENTITY,
  };
  const token = await new SignJWT({ email: PUSH_IDENTITY, email_verified: true })
    .setProtectedHeader({ alg: "RS256", kid: "fixture" })
    .setIssuer("https://accounts.google.com")
    .setAudience(AUDIENCE)
    .setSubject("1234567890")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);

  const claims = await verifyCareerPushIdentity(token, config, async () => publicKey);
  assert.equal(claims.email, PUSH_IDENTITY);

  await assert.rejects(
    verifyCareerPushIdentity(token, { ...config, audience: `${AUDIENCE}/candidate` }, async () => publicKey),
    /audience|claim/i,
  );
  await assert.rejects(
    verifyCareerPushIdentity(token, { ...config, serviceAccountEmail: `other-${PUSH_IDENTITY}` }, async () => publicKey),
    /principal|identity/i,
  );
});

type ClaimKind = "new" | "retry" | "duplicate" | "conflict";

function scriptedStore(args: {
  claim: ClaimKind;
  checkpointVersion?: number;
  projectError?: Error;
}) {
  const calls: string[] = [];
  const transaction: CareerEventTransaction = {
    async claim() {
      calls.push("claim");
      return { kind: args.claim, existingDigest: args.claim === "conflict" ? "0".repeat(64) : undefined };
    },
    async quarantineDigestConflict() {
      calls.push("quarantine");
    },
    async lockCheckpoint() {
      calls.push("checkpoint.lock");
      return args.checkpointVersion ?? 0;
    },
    async recordVersionFailure(kind) {
      calls.push(`version.${kind}`);
    },
    async project() {
      calls.push("project");
      if (args.projectError) throw args.projectError;
    },
    async advanceCheckpoint() {
      calls.push("checkpoint.advance");
    },
    async markApplied() {
      calls.push("applied");
    },
  };
  const store: CareerEventStore = {
    async transaction(run) {
      calls.push("transaction.begin");
      try {
        const result = await run(transaction);
        calls.push("transaction.commit");
        return result;
      } catch (error) {
        calls.push("transaction.rollback");
        throw error;
      }
    },
  };
  return { calls, store };
}

function delivery(sequence = 1): CareerDelivery {
  return parseCareerPubSubPush(pushEnvelope(careerEvent({ sequence })), SUBSCRIPTION);
}

test("claims, version-checks, projects, checkpoints, and applies in one transaction", async () => {
  const { calls, store } = scriptedStore({ claim: "new", checkpointVersion: 0 });
  assert.equal(await processCareerDelivery(store, delivery()), "applied");
  assert.deepEqual(calls, [
    "transaction.begin",
    "claim",
    "checkpoint.lock",
    "project",
    "checkpoint.advance",
    "applied",
    "transaction.commit",
  ]);
});

test("same event id and digest is a successful no-op after a lost acknowledgement", async () => {
  const { calls, store } = scriptedStore({ claim: "duplicate" });
  assert.equal(await processCareerDelivery(store, delivery()), "duplicate");
  assert.deepEqual(calls, ["transaction.begin", "claim", "transaction.commit"]);
});

test("same event id with a different digest quarantines and commits without projection", async () => {
  const { calls, store } = scriptedStore({ claim: "conflict" });
  assert.equal(await processCareerDelivery(store, delivery()), "quarantined");
  assert.deepEqual(calls, ["transaction.begin", "claim", "quarantine", "transaction.commit"]);
});

test("gaps and stale aggregate versions are recorded for retry without projection", async () => {
  const gap = scriptedStore({ claim: "new", checkpointVersion: 1 });
  assert.equal(await processCareerDelivery(gap.store, delivery(3)), "version-gap");
  assert.deepEqual(gap.calls, [
    "transaction.begin",
    "claim",
    "checkpoint.lock",
    "version.gap",
    "transaction.commit",
  ]);

  const stale = scriptedStore({ claim: "retry", checkpointVersion: 3 });
  assert.equal(await processCareerDelivery(stale.store, delivery(2)), "stale-version");
  assert.deepEqual(stale.calls, [
    "transaction.begin",
    "claim",
    "checkpoint.lock",
    "version.stale",
    "transaction.commit",
  ]);
});

test("projection failure rolls back and remains retryable", async () => {
  const { calls, store } = scriptedStore({
    claim: "new",
    checkpointVersion: 0,
    projectError: new Error("transient database failure"),
  });
  await assert.rejects(processCareerDelivery(store, delivery()), /transient database failure/);
  assert.deepEqual(calls, [
    "transaction.begin",
    "claim",
    "checkpoint.lock",
    "project",
    "transaction.rollback",
  ]);
});

async function invokePushHandler(
  store: CareerEventStore,
  logger: Pick<Console, "error"> = { error() {} },
) {
  const handler = createCareerPubSubHandler(store, SUBSCRIPTION, logger);
  const response = {
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    locals: {
      careerPushPrincipal: PUSH_IDENTITY,
      careerPushAssertionDigest: "a".repeat(64),
    },
    statusCode: 200,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(value: unknown) {
      this.body = value;
      return this;
    },
    end() {
      return this;
    },
  };
  await handler(
    { body: pushEnvelope() } as never,
    response as never,
    (() => undefined) as never,
  );
  return response;
}

test("HTTP handler acknowledges permanent outcomes and retries version/transient failures", async () => {
  assert.equal((await invokePushHandler(scriptedStore({ claim: "duplicate" }).store)).statusCode, 204);
  assert.equal((await invokePushHandler(scriptedStore({ claim: "conflict" }).store)).statusCode, 204);
  assert.equal((await invokePushHandler(scriptedStore({ claim: "new", checkpointVersion: 2 }).store)).statusCode, 409);
  const transient = await invokePushHandler(scriptedStore({
    claim: "new",
    checkpointVersion: 0,
    projectError: new Error("temporary outage"),
  }).store);
  assert.equal(transient.statusCode, 503);
  assert.equal(transient.headers["Retry-After"], "5");
});

test("transient logs omit database messages, SQL, parameters, and payload details", async () => {
  let logged: unknown;
  await invokePushHandler(
    scriptedStore({
      claim: "new",
      checkpointVersion: 0,
      projectError: new Error("Failed query: SELECT secret FROM private; params: bearer-token"),
    }).store,
    {
      error(_message, meta) {
        logged = meta;
      },
    },
  );

  assert.deepEqual(logged, {
    eventId: "event-1",
    aggregateId: "experience-1",
    messageId: "message-1",
    error: "Error",
  });
});

test("0015 adds only the inbox, checkpoint, and quarantine control tables", () => {
  const migration = readFileSync(
    path.resolve(process.cwd(), "src", "migrations", "0015_career_pubsub_consumer.sql"),
    "utf8",
  );
  for (const table of [
    "career_event_inbox",
    "career_event_checkpoints",
    "career_event_quarantine",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  }
  assert.doesNotMatch(migration, /\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO|FROM|[A-Za-z_"])/i);
  assert.match(migration, /PRIMARY KEY \("consumer", "event_id"\)/);
  assert.match(migration, /PRIMARY KEY \("consumer", "aggregate_id"\)/);
  assert.match(migration, /PRIMARY KEY \("consumer", "event_id", "observed_digest"\)/);
});

test("runtime no longer imports or depends on KafkaJS", () => {
  const packageJson = JSON.parse(readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"));
  const indexSource = readFileSync(
    path.resolve(process.cwd(), "src", "backend", "index.ts"),
    "utf8",
  );

  assert.equal(packageJson.dependencies?.kafkajs, undefined);
  assert.doesNotMatch(indexSource, /startCareerEventsConsumer|kafkajs|KAFKA_/i);
  const routeAuthPosition = indexSource.indexOf(
    "    createCareerPushIdentityMiddleware(identityConfig),",
  );
  const routeBodyPosition = indexSource.indexOf(
    '    express.json({ limit: "2mb", strict: true }),',
  );
  const originGatePosition = indexSource.indexOf(
    "  app.use(createOriginAccessMiddleware(",
  );
  assert.ok(routeAuthPosition >= 0 && routeBodyPosition >= 0 && originGatePosition >= 0);
  assert.ok(
    routeAuthPosition < routeBodyPosition,
    "Google OIDC authentication must run before the route-specific body parser",
  );
  assert.ok(
    routeAuthPosition < originGatePosition,
    "the authenticated Pub/Sub route must mount before the Cloudflare-only origin gate",
  );
});
