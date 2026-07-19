import { createHash } from "node:crypto";
import type { RequestHandler } from "express";
import { sql } from "drizzle-orm";
import type { db as PortfolioDb } from "../data/db";
import {
  parseCareerEvent,
  type CareerEventEnvelope,
  type EducationEventData,
  type ExperienceEventData,
  type ProfileEventData,
  type ProjectEventData,
  type SkillConceptEventData,
} from "./career-events-types";
import {
  consoleProjectionLogger,
  projectEducation,
  projectExperience,
  projectProfile,
  projectProject,
  projectSkill,
  type Db as ProjectionDb,
} from "./career-projection";

export const CAREER_PUBSUB_PATH = "/internal/pubsub/career";
export const CAREER_CONSUMER = "portfolio-career-v1";

const SHA256 = /^[0-9a-f]{64}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const SUBSCRIPTION = /^projects\/[a-z][a-z0-9-]{4,28}[a-z0-9]\/subscriptions\/[A-Za-z][A-Za-z0-9._~+%-]{2,254}$/;
const MAX_ENCODED_DATA_LENGTH = 1_400_000;

interface PubSubMessage {
  attributes?: Record<string, string>;
  data: string;
  messageId?: string;
  message_id?: string;
  orderingKey?: string;
  publishTime?: string;
  publish_time?: string;
}

interface PubSubPushEnvelope {
  deliveryAttempt?: number;
  message: PubSubMessage;
  subscription: string;
}

export interface CareerDelivery {
  event: CareerEventEnvelope;
  payloadDigest: string;
  messageId: string;
  subscription: string;
  orderingKey: string;
  publishTime: string;
  deliveryAttempt: number | null;
  contractVersion: string;
  producerRelease: string;
  replayEpoch: number | null;
  authenticatedPrincipal: string | null;
  authenticationAssertionDigest: string | null;
}

export type CareerProcessingResult =
  | "applied"
  | "duplicate"
  | "quarantined"
  | "version-gap"
  | "stale-version";

export type ClaimResult =
  | { kind: "new" | "retry" | "duplicate"; existingDigest?: undefined }
  | { kind: "conflict"; existingDigest: string };

export interface CareerEventTransaction {
  claim(delivery: CareerDelivery): Promise<ClaimResult>;
  quarantineDigestConflict(delivery: CareerDelivery, expectedDigest: string): Promise<void>;
  lockCheckpoint(delivery: CareerDelivery): Promise<number>;
  recordVersionFailure(
    kind: "gap" | "stale",
    delivery: CareerDelivery,
    checkpointVersion: number,
  ): Promise<void>;
  project(delivery: CareerDelivery): Promise<void>;
  advanceCheckpoint(delivery: CareerDelivery): Promise<void>;
  markApplied(delivery: CareerDelivery): Promise<void>;
}

export interface CareerEventStore {
  transaction<T>(run: (transaction: CareerEventTransaction) => Promise<T>): Promise<T>;
}

export class CareerPubSubRequestError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: 400 | 403,
    message: string,
  ) {
    super(message);
    this.name = "CareerPubSubRequestError";
  }
}

function requestError(code: string, message: string, statusCode: 400 | 403 = 400): never {
  throw new CareerPubSubRequestError(code, statusCode, message);
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function parseMessage(value: unknown): PubSubMessage {
  const message = objectRecord(value);
  if (!message || typeof message.data !== "string") {
    return requestError("invalid_envelope", "Pub/Sub push message.data is required");
  }
  const attributes = message.attributes === undefined
    ? undefined
    : objectRecord(message.attributes);
  if (
    attributes
    && Object.values(attributes).some((attribute) => typeof attribute !== "string")
  ) {
    return requestError("invalid_attributes", "Pub/Sub message attributes must be strings");
  }
  return {
    data: message.data,
    attributes: attributes as Record<string, string> | undefined,
    messageId: typeof message.messageId === "string" ? message.messageId : undefined,
    message_id: typeof message.message_id === "string" ? message.message_id : undefined,
    orderingKey: typeof message.orderingKey === "string" ? message.orderingKey : undefined,
    publishTime: typeof message.publishTime === "string" ? message.publishTime : undefined,
    publish_time: typeof message.publish_time === "string" ? message.publish_time : undefined,
  };
}

function parsePushEnvelope(value: unknown): PubSubPushEnvelope {
  const envelope = objectRecord(value);
  if (!envelope || typeof envelope.subscription !== "string") {
    return requestError("invalid_envelope", "Pub/Sub push subscription is required");
  }
  if (
    envelope.deliveryAttempt !== undefined
    && (!Number.isSafeInteger(envelope.deliveryAttempt) || Number(envelope.deliveryAttempt) < 1)
  ) {
    return requestError("invalid_delivery_attempt", "Pub/Sub deliveryAttempt must be a positive integer");
  }
  return {
    message: parseMessage(envelope.message),
    subscription: envelope.subscription,
    deliveryAttempt: envelope.deliveryAttempt as number | undefined,
  };
}

function decodeBase64(value: string): Buffer {
  if (
    value.length === 0
    || value.length > MAX_ENCODED_DATA_LENGTH
    || value.length % 4 !== 0
    || !BASE64.test(value)
  ) {
    return requestError("invalid_base64", "Pub/Sub message.data is not canonical base64");
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) {
    return requestError("invalid_base64", "Pub/Sub message.data is not canonical base64");
  }
  return decoded;
}

function exactMessageField(primary: string | undefined, alias: string | undefined, name: string): string {
  const value = primary ?? alias;
  if (!value || (primary && alias && primary !== alias)) {
    return requestError("invalid_envelope", `Pub/Sub ${name} is missing or inconsistent`);
  }
  return value;
}

function parseReplayEpoch(value: string | undefined): number | null {
  if (value === undefined) return null;
  if (!/^(0|[1-9][0-9]{0,9})$/.test(value)) {
    return requestError("invalid_replay_epoch", "Pub/Sub replay_epoch must be a non-negative integer");
  }
  const epoch = Number(value);
  if (!Number.isSafeInteger(epoch)) {
    return requestError("invalid_replay_epoch", "Pub/Sub replay_epoch is outside the supported range");
  }
  return epoch;
}

export function parseCareerPubSubPush(
  body: unknown,
  expectedSubscription: string,
): CareerDelivery {
  if (!SUBSCRIPTION.test(expectedSubscription)) {
    throw new Error("CAREER_PUBSUB_SUBSCRIPTION must be an exact Pub/Sub subscription resource");
  }
  const envelope = parsePushEnvelope(body);
  if (envelope.subscription !== expectedSubscription) {
    return requestError("subscription_rejected", "Pub/Sub subscription is not allowed", 403);
  }
  const attributes = envelope.message.attributes ?? {};
  if (
    Object.keys(attributes).some((name) => name.startsWith("CloudPubSubDeadLetterSource"))
  ) {
    return requestError("dead_letter_input", "Forwarded dead-letter messages are not accepted by the live projector");
  }
  if (attributes.contract_version !== "1") {
    return requestError("contract_version_rejected", "Pub/Sub contract_version must be 1");
  }
  if (!attributes.producer_release || attributes.producer_release.length > 256) {
    return requestError("producer_release_rejected", "Pub/Sub producer_release is required");
  }

  const raw = decodeBase64(envelope.message.data);
  let event: CareerEventEnvelope;
  try {
    event = parseCareerEvent(raw);
  } catch (error) {
    return requestError(
      "career_event_rejected",
      error instanceof Error ? error.message : "Career event schema rejected the payload",
    );
  }
  if (attributes.event_type !== event.event_type) {
    return requestError("event_type_rejected", "Pub/Sub event_type does not match the career event");
  }
  if (envelope.message.orderingKey !== event.aggregate_id) {
    return requestError("ordering_key_rejected", "Pub/Sub orderingKey must equal aggregate_id");
  }

  const messageId = exactMessageField(
    envelope.message.messageId,
    envelope.message.message_id,
    "messageId",
  );
  const publishTime = exactMessageField(
    envelope.message.publishTime,
    envelope.message.publish_time,
    "publishTime",
  );
  if (messageId.length > 256 || Number.isNaN(Date.parse(publishTime))) {
    return requestError("invalid_envelope", "Pub/Sub message metadata is invalid");
  }

  return {
    event,
    payloadDigest: createHash("sha256").update(raw).digest("hex"),
    messageId,
    subscription: envelope.subscription,
    orderingKey: envelope.message.orderingKey,
    publishTime,
    deliveryAttempt: envelope.deliveryAttempt ?? null,
    contractVersion: attributes.contract_version,
    producerRelease: attributes.producer_release,
    replayEpoch: parseReplayEpoch(attributes.replay_epoch),
    authenticatedPrincipal: null,
    authenticationAssertionDigest: null,
  };
}

export async function processCareerDelivery(
  store: CareerEventStore,
  delivery: CareerDelivery,
): Promise<CareerProcessingResult> {
  if (!SHA256.test(delivery.payloadDigest)) {
    throw new Error("Career event payload digest is invalid");
  }
  return store.transaction(async (transaction) => {
    const claim = await transaction.claim(delivery);
    if (claim.kind === "duplicate") return "duplicate";
    if (claim.kind === "conflict") {
      await transaction.quarantineDigestConflict(delivery, claim.existingDigest);
      return "quarantined";
    }

    const checkpointVersion = await transaction.lockCheckpoint(delivery);
    const aggregateVersion = delivery.event.sequence;
    if (aggregateVersion <= checkpointVersion) {
      await transaction.recordVersionFailure("stale", delivery, checkpointVersion);
      return "stale-version";
    }
    if (aggregateVersion !== checkpointVersion + 1) {
      await transaction.recordVersionFailure("gap", delivery, checkpointVersion);
      return "version-gap";
    }

    await transaction.project(delivery);
    await transaction.advanceCheckpoint(delivery);
    await transaction.markApplied(delivery);
    return "applied";
  });
}

type DrizzleTransaction = Parameters<Parameters<typeof PortfolioDb.transaction>[0]>[0];
type CareerProjector = (transaction: ProjectionDb, event: CareerEventEnvelope) => Promise<void>;

async function defaultProjector(
  transaction: ProjectionDb,
  envelope: CareerEventEnvelope,
): Promise<void> {
  switch (envelope.event_type) {
    case "ExperienceUpserted":
    case "ExperienceDeleted":
      await projectExperience(
        transaction,
        envelope as CareerEventEnvelope<ExperienceEventData>,
        consoleProjectionLogger,
      );
      return;
    case "ProjectUpserted":
    case "ProjectDeleted":
      await projectProject(
        transaction,
        envelope as CareerEventEnvelope<ProjectEventData>,
        consoleProjectionLogger,
      );
      return;
    case "EducationUpserted":
    case "EducationDeleted":
      await projectEducation(
        transaction,
        envelope as CareerEventEnvelope<EducationEventData>,
        consoleProjectionLogger,
      );
      return;
    case "SkillConceptUpserted":
    case "SkillConceptDeleted":
      await projectSkill(
        transaction,
        envelope as CareerEventEnvelope<SkillConceptEventData>,
        consoleProjectionLogger,
      );
      return;
    case "ProfileUpserted":
    case "ProfileDeleted":
      projectProfile(
        envelope as CareerEventEnvelope<ProfileEventData>,
        consoleProjectionLogger,
      );
  }
}

class PostgresCareerEventTransaction implements CareerEventTransaction {
  constructor(
    private readonly transaction: DrizzleTransaction,
    private readonly projector: CareerProjector,
  ) {}

  async claim(delivery: CareerDelivery): Promise<ClaimResult> {
    const inserted = await this.transaction.execute(sql`
      INSERT INTO portfolio.career_event_inbox (
        consumer, event_id, payload_digest, aggregate_id, aggregate_version,
        event_type, first_message_id, last_message_id, subscription, ordering_key,
        contract_version, producer_release, replay_epoch, delivery_attempt,
        authenticated_principal, authentication_assertion_digest, status
      ) VALUES (
        ${CAREER_CONSUMER}, ${delivery.event.event_id}, ${delivery.payloadDigest},
        ${delivery.event.aggregate_id}, ${delivery.event.sequence}, ${delivery.event.event_type},
        ${delivery.messageId}, ${delivery.messageId}, ${delivery.subscription},
        ${delivery.orderingKey}, ${delivery.contractVersion}, ${delivery.producerRelease},
        ${delivery.replayEpoch}, ${delivery.deliveryAttempt}, ${delivery.authenticatedPrincipal},
        ${delivery.authenticationAssertionDigest}, 'processing'
      )
      ON CONFLICT (consumer, event_id) DO NOTHING
      RETURNING payload_digest
    `);
    const claimed = await this.transaction.execute(sql`
      SELECT payload_digest, status
      FROM portfolio.career_event_inbox
      WHERE consumer = ${CAREER_CONSUMER} AND event_id = ${delivery.event.event_id}
      FOR UPDATE
    `);
    const row = claimed.rows[0] as { payload_digest?: unknown; status?: unknown } | undefined;
    if (
      !row
      || typeof row.payload_digest !== "string"
      || typeof row.status !== "string"
    ) {
      throw new Error("Career event inbox claim did not return one valid row");
    }
    if (inserted.rows.length === 0) {
      await this.transaction.execute(sql`
        UPDATE portfolio.career_event_inbox
        SET attempts = attempts + 1,
            last_message_id = ${delivery.messageId},
            last_received_at = clock_timestamp(),
            delivery_attempt = ${delivery.deliveryAttempt},
            replay_epoch = ${delivery.replayEpoch}
        WHERE consumer = ${CAREER_CONSUMER} AND event_id = ${delivery.event.event_id}
      `);
    }
    if (row.payload_digest !== delivery.payloadDigest) {
      return { kind: "conflict", existingDigest: row.payload_digest };
    }
    if (inserted.rows.length > 0) return { kind: "new" };
    if (row.status === "applied") return { kind: "duplicate" };
    await this.transaction.execute(sql`
      UPDATE portfolio.career_event_inbox
      SET status = 'processing', error_code = NULL,
          observed_checkpoint_version = NULL, expected_aggregate_version = NULL
      WHERE consumer = ${CAREER_CONSUMER} AND event_id = ${delivery.event.event_id}
    `);
    return { kind: "retry" };
  }

  async quarantineDigestConflict(
    delivery: CareerDelivery,
    expectedDigest: string,
  ): Promise<void> {
    await this.transaction.execute(sql`
      INSERT INTO portfolio.career_event_quarantine (
        consumer, event_id, expected_digest, observed_digest, aggregate_id,
        aggregate_version, event_type, observed_message_id, subscription, reason
      ) VALUES (
        ${CAREER_CONSUMER}, ${delivery.event.event_id}, ${expectedDigest},
        ${delivery.payloadDigest}, ${delivery.event.aggregate_id}, ${delivery.event.sequence},
        ${delivery.event.event_type}, ${delivery.messageId}, ${delivery.subscription},
        'digest_conflict'
      )
      ON CONFLICT (consumer, event_id, observed_digest) DO NOTHING
    `);
  }

  async lockCheckpoint(delivery: CareerDelivery): Promise<number> {
    await this.transaction.execute(sql`
      INSERT INTO portfolio.career_event_checkpoints (consumer, aggregate_id, aggregate_version)
      VALUES (${CAREER_CONSUMER}, ${delivery.event.aggregate_id}, 0)
      ON CONFLICT (consumer, aggregate_id) DO NOTHING
    `);
    const result = await this.transaction.execute(sql`
      SELECT aggregate_version
      FROM portfolio.career_event_checkpoints
      WHERE consumer = ${CAREER_CONSUMER} AND aggregate_id = ${delivery.event.aggregate_id}
      FOR UPDATE
    `);
    const value = (result.rows[0] as { aggregate_version?: unknown } | undefined)?.aggregate_version;
    const version = typeof value === "bigint" || typeof value === "number" || typeof value === "string"
      ? Number(value)
      : Number.NaN;
    if (!Number.isSafeInteger(version) || version < 0) {
      throw new Error("Career event checkpoint did not return a valid aggregate version");
    }
    return version;
  }

  async recordVersionFailure(
    kind: "gap" | "stale",
    delivery: CareerDelivery,
    checkpointVersion: number,
  ): Promise<void> {
    await this.transaction.execute(sql`
      UPDATE portfolio.career_event_inbox
      SET status = ${kind === "gap" ? "version_gap" : "stale"},
          error_code = ${kind === "gap" ? "aggregate_version_gap" : "stale_aggregate_version"},
          observed_checkpoint_version = ${checkpointVersion},
          expected_aggregate_version = ${checkpointVersion + 1},
          last_error_at = clock_timestamp()
      WHERE consumer = ${CAREER_CONSUMER} AND event_id = ${delivery.event.event_id}
        AND payload_digest = ${delivery.payloadDigest}
    `);
  }

  async project(delivery: CareerDelivery): Promise<void> {
    await this.projector(
      this.transaction as unknown as ProjectionDb,
      delivery.event,
    );
  }

  async advanceCheckpoint(delivery: CareerDelivery): Promise<void> {
    await this.transaction.execute(sql`
      UPDATE portfolio.career_event_checkpoints
      SET aggregate_version = ${delivery.event.sequence},
          event_id = ${delivery.event.event_id},
          payload_digest = ${delivery.payloadDigest},
          replay_epoch = ${delivery.replayEpoch},
          updated_at = clock_timestamp()
      WHERE consumer = ${CAREER_CONSUMER} AND aggregate_id = ${delivery.event.aggregate_id}
    `);
  }

  async markApplied(delivery: CareerDelivery): Promise<void> {
    await this.transaction.execute(sql`
      UPDATE portfolio.career_event_inbox
      SET status = 'applied', applied_at = clock_timestamp(), error_code = NULL,
          observed_checkpoint_version = NULL, expected_aggregate_version = NULL
      WHERE consumer = ${CAREER_CONSUMER} AND event_id = ${delivery.event.event_id}
        AND payload_digest = ${delivery.payloadDigest}
    `);
  }
}

export function createPostgresCareerEventStore(
  database: typeof PortfolioDb,
  projector: CareerProjector = defaultProjector,
): CareerEventStore {
  return {
    transaction: (run) => database.transaction((transaction) => run(
      new PostgresCareerEventTransaction(transaction, projector),
    )),
  };
}

export function createCareerPubSubHandler(
  store: CareerEventStore,
  expectedSubscription: string,
  logger: Pick<Console, "error"> = console,
): RequestHandler {
  if (!SUBSCRIPTION.test(expectedSubscription)) {
    throw new Error("CAREER_PUBSUB_SUBSCRIPTION must be an exact Pub/Sub subscription resource");
  }
  return async (request, response) => {
    let delivery: CareerDelivery;
    try {
      delivery = {
        ...parseCareerPubSubPush(request.body, expectedSubscription),
        authenticatedPrincipal:
          typeof response.locals.careerPushPrincipal === "string"
            ? response.locals.careerPushPrincipal
            : null,
        authenticationAssertionDigest:
          typeof response.locals.careerPushAssertionDigest === "string"
            ? response.locals.careerPushAssertionDigest
            : null,
      };
    } catch (error) {
      if (error instanceof CareerPubSubRequestError) {
        response.status(error.statusCode).json({ error: error.code });
        return;
      }
      response.status(400).json({ error: "invalid_pubsub_request" });
      return;
    }

    try {
      const result = await processCareerDelivery(store, delivery);
      if (result === "version-gap" || result === "stale-version") {
        response.status(409).json({ error: result });
        return;
      }
      response.status(204).end();
    } catch (error) {
      logger.error("[career-pubsub] transient processing failure", {
        eventId: delivery.event.event_id,
        aggregateId: delivery.event.aggregate_id,
        messageId: delivery.messageId,
        error: error instanceof Error ? error.name : "UnknownError",
      });
      response.setHeader("Retry-After", "5");
      response.status(503).json({ error: "career_projection_unavailable" });
    }
  };
}
