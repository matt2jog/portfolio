// Kafka consumer for career-context domain events (DECOUPLING.md §6).
//
// Subscribes to the five compacted `career.*.v1` topics published by the resume-studio
// ("career") service and projects them into the pre-existing portfolio tables
// (experiences, education, projects, xyz_bullets, all_skills). Portfolio remains the
// system of record for its own display-only fields (image, hover_image, category,
// portfolio_skills, bio…) — those are never touched here.
//
// Only started when CAREER_EVENTS_ENABLED=1. Never allowed to crash the web server:
// every per-message failure is caught, logged, and the consumer keeps polling.

import { Kafka, logLevel, type Consumer, type EachMessagePayload } from "kafkajs";
import { readFileSync } from "node:fs";
import { db } from "../data/db";
import {
  parseEnvelope,
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
} from "./career-projection";

const CONSUMER_GROUP_ID = "portfolio-career-projector";

const TOPICS = [
  "career.profile.v1",
  "career.education.v1",
  "career.experience.v1",
  "career.project.v1",
  "career.skill.v1",
] as const;

type CareerTopic = (typeof TOPICS)[number];

// Synthetic event_type used when we only have a tombstone (null message value) and no
// envelope — the topic tells us which aggregate, the key tells us which row.
const TOMBSTONE_EVENT_TYPE: Record<CareerTopic, string> = {
  "career.profile.v1": "ProfileDeleted",
  "career.education.v1": "EducationDeleted",
  "career.experience.v1": "ExperienceDeleted",
  "career.project.v1": "ProjectDeleted",
  "career.skill.v1": "SkillConceptDeleted",
};

function readCaCert(): string | undefined {
  const inlinePath = process.env.KAFKA_CA_CERT_PATH;
  const inline = process.env.KAFKA_CA_CERT;
  const fromPath = inlinePath ? readFileSync(inlinePath, "utf8") : undefined;
  const inlineNormalized = inline ? inline.replace(/\\n/g, "\n") : undefined;
  return inlineNormalized || fromPath;
}

interface CareerEventsConfig {
  brokers: string[];
  username: string;
  password: string;
  ca: string;
}

function loadConfig(): CareerEventsConfig | null {
  if (process.env.CAREER_EVENTS_ENABLED !== "1") {
    return null;
  }

  const bootstrap = process.env.KAFKA_BOOTSTRAP_SERVERS;
  const username = process.env.KAFKA_SASL_USERNAME;
  const password = process.env.KAFKA_SASL_PASSWORD;
  const ca = readCaCert();

  const missing: string[] = [];
  if (!bootstrap) missing.push("KAFKA_BOOTSTRAP_SERVERS");
  if (!username) missing.push("KAFKA_SASL_USERNAME");
  if (!password) missing.push("KAFKA_SASL_PASSWORD");
  if (!ca) missing.push("KAFKA_CA_CERT (or KAFKA_CA_CERT_PATH)");

  if (missing.length > 0) {
    console.error(
      `[career-events] CAREER_EVENTS_ENABLED=1 but missing required env var(s): ${missing.join(", ")}. Consumer NOT started.`,
    );
    return null;
  }

  return {
    brokers: bootstrap!.split(",").map((b) => b.trim()).filter(Boolean),
    username: username!,
    password: password!,
    ca: ca!,
  };
}

let consumer: Consumer | null = null;
let shutdownHooked = false;

export async function startCareerEventsConsumer(): Promise<void> {
  const config = loadConfig();
  if (!config) {
    return;
  }

  const kafka = new Kafka({
    clientId: "portfolio-career-projector",
    brokers: config.brokers,
    ssl: { ca: [config.ca] },
    sasl: {
      mechanism: "scram-sha-256",
      username: config.username,
      password: config.password,
    },
    logLevel: logLevel.NOTHING,
  });

  consumer = kafka.consumer({ groupId: CONSUMER_GROUP_ID });

  try {
    await consumer.connect();
    await consumer.subscribe({ topics: [...TOPICS], fromBeginning: true });

    await consumer.run({
      eachMessage: async (payload) => {
        try {
          await handleMessage(payload);
        } catch (err) {
          // Crash-safe: never allowed to take the web server (or the consumer loop)
          // down. Malformed messages are already handled without throwing (parseEnvelope
          // returns null and handleMessage logs+returns) — anything that reaches this
          // catch is an unexpected failure (e.g. a transient DB/pool error) from inside a
          // projection call.
          //
          // Known v1 limitation: with kafkajs's default autoCommit, swallowing the error
          // here still advances the consumer offset, so a transient DB failure silently
          // drops that one projection update (self-heals only if a later event for the
          // same key arrives). The alternative — rethrowing so kafkajs holds the offset
          // and retries — was deliberately not taken for v1 to avoid redesigning around
          // manual offset commits; kafkajs's own crash/retry handling on a thrown
          // eachMessage error does not exit the process either way (no CRASH-event
          // process.exit hook is registered), so "never take the web server down" holds
          // regardless of this choice.
          console.error("[career-events] failed to process message; skipping", {
            topic: payload.topic,
            partition: payload.partition,
            offset: payload.message.offset,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },
    });

    console.log(`[career-events] consumer started (group=${CONSUMER_GROUP_ID}, topics=${TOPICS.join(", ")})`);
  } catch (err) {
    console.error("[career-events] failed to start consumer", err);
    consumer = null;
    return;
  }

  hookGracefulShutdown();
}

export async function stopCareerEventsConsumer(): Promise<void> {
  if (!consumer) return;
  const toStop = consumer;
  consumer = null;
  try {
    await toStop.disconnect();
    console.log("[career-events] consumer stopped");
  } catch (err) {
    console.error("[career-events] error while stopping consumer", err);
  }
}

function hookGracefulShutdown(): void {
  if (shutdownHooked) return;
  shutdownHooked = true;

  const shutdown = () => {
    stopCareerEventsConsumer().finally(() => {
      // Intentionally do not process.exit() here — let the rest of the server's own
      // shutdown handling (if any) proceed; this only tears down our consumer.
    });
  };

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

async function handleMessage({ topic, message }: EachMessagePayload): Promise<void> {
  const careerTopic = topic as CareerTopic;
  const key = message.key ? message.key.toString("utf8") : undefined;

  // True Kafka tombstone: null message value on a compacted topic. We only have the
  // topic + key; synthesize a minimal delete envelope so the same projection functions
  // handle both delete paths (explicit "*Deleted" event and raw tombstone) uniformly.
  if (message.value === null) {
    if (!key) {
      console.warn(`[career-events] tombstone on ${topic} with no key; skipping`);
      return;
    }
    const tombstoneEnvelope: CareerEventEnvelope = {
      event_id: "tombstone",
      event_type: TOMBSTONE_EVENT_TYPE[careerTopic],
      aggregate_id: key,
      occurred_at: new Date().toISOString(),
      actor: "system:kafka-tombstone",
      sequence: 0,
      data: null,
    };
    await dispatch(careerTopic, tombstoneEnvelope);
    return;
  }

  const envelope = parseEnvelope(message.value);
  if (!envelope) {
    console.warn(`[career-events] malformed message on ${topic}; skipping`, { key });
    return;
  }

  await dispatch(careerTopic, envelope);
}

async function dispatch(topic: CareerTopic, envelope: CareerEventEnvelope): Promise<void> {
  switch (topic) {
    case "career.experience.v1":
      await projectExperience(db, envelope as CareerEventEnvelope<ExperienceEventData>, consoleProjectionLogger);
      return;
    case "career.project.v1":
      await projectProject(db, envelope as CareerEventEnvelope<ProjectEventData>, consoleProjectionLogger);
      return;
    case "career.education.v1":
      await projectEducation(db, envelope as CareerEventEnvelope<EducationEventData>, consoleProjectionLogger);
      return;
    case "career.skill.v1":
      await projectSkill(db, envelope as CareerEventEnvelope<SkillConceptEventData>, consoleProjectionLogger);
      return;
    case "career.profile.v1":
      projectProfile(envelope as CareerEventEnvelope<ProfileEventData>, consoleProjectionLogger);
      return;
    default:
      console.warn(`[career-events] unhandled topic ${topic}; ignoring`);
  }
}
