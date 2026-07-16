import { z } from "zod";

export const CAREER_EVENT_TYPES = [
  "ProfileUpserted",
  "ProfileDeleted",
  "EducationUpserted",
  "EducationDeleted",
  "ExperienceUpserted",
  "ExperienceDeleted",
  "ProjectUpserted",
  "ProjectDeleted",
  "SkillConceptUpserted",
  "SkillConceptDeleted",
] as const;

export type CareerEventType = (typeof CAREER_EVENT_TYPES)[number];

export interface CareerEventEnvelope<TData = unknown> {
  event_id: string;
  event_type: CareerEventType;
  aggregate_id: string;
  occurred_at: string;
  actor: string;
  sequence: number;
  data: TData | null;
}

export interface BulletEventData {
  id: string;
  text: string;
  position?: number;
}

export interface ExperienceEventData {
  id: string;
  role: string;
  company: string;
  location?: string;
  duration?: string;
  description?: string;
  technologies?: string[];
  is_active?: boolean;
  position?: number;
  bullets?: BulletEventData[];
}

export interface ProjectEventData {
  id: string;
  title: string;
  description?: string;
  long_description?: string | null;
  tech?: string[];
  deployed_url?: string | null;
  github_url?: string | null;
  position?: number;
  bullets?: BulletEventData[];
}

export interface EducationEventData {
  id: string;
  school: string;
  location?: string;
  degree: string;
  dates?: string;
  position?: number;
}

export interface SkillVariantEventData {
  id: string;
  wording: string;
  is_default: boolean;
  legacy_all_skill_id?: string | null;
}

export interface SkillConceptEventData {
  id: string;
  name: string;
  tags?: string[];
  variants: SkillVariantEventData[];
}

export interface ProfileEventData {
  name: string;
  phone?: string;
  email: string;
  website?: string;
  linkedin_url?: string;
  linkedin_display?: string;
  github_url?: string;
  github_display?: string;
}

export type ExperienceEnvelope = CareerEventEnvelope<ExperienceEventData>;
export type ProjectEnvelope = CareerEventEnvelope<ProjectEventData>;
export type EducationEnvelope = CareerEventEnvelope<EducationEventData>;
export type SkillEnvelope = CareerEventEnvelope<SkillConceptEventData>;
export type ProfileEnvelope = CareerEventEnvelope<ProfileEventData>;

const identifier = z.string().min(1).max(512);
const text = z.string().max(20_000);
const position = z.number().int();
const bullet = z.object({
  id: identifier,
  text,
  position: position.optional(),
}).passthrough();

const experience = z.object({
  id: identifier,
  role: text,
  company: text,
  location: text.optional(),
  duration: text.optional(),
  description: text.optional(),
  technologies: z.array(text).optional(),
  is_active: z.boolean().optional(),
  position: position.optional(),
  bullets: z.array(bullet).optional(),
}).passthrough();

const project = z.object({
  id: identifier,
  title: text,
  description: text.optional(),
  long_description: text.nullable().optional(),
  tech: z.array(text).optional(),
  deployed_url: text.nullable().optional(),
  github_url: text.nullable().optional(),
  position: position.optional(),
  bullets: z.array(bullet).optional(),
}).passthrough();

const education = z.object({
  id: identifier,
  school: text,
  location: text.optional(),
  degree: text,
  dates: text.optional(),
  position: position.optional(),
}).passthrough();

const skill = z.object({
  id: identifier,
  name: text,
  tags: z.array(text).optional(),
  variants: z.array(z.object({
    id: identifier,
    wording: text,
    is_default: z.boolean(),
    legacy_all_skill_id: identifier.nullable().optional(),
  }).passthrough()),
}).passthrough();

const profile = z.object({
  name: text,
  phone: text.optional(),
  email: text,
  website: text.optional(),
  linkedin_url: text.optional(),
  linkedin_display: text.optional(),
  github_url: text.optional(),
  github_display: text.optional(),
}).passthrough();

const common = {
  event_id: identifier,
  aggregate_id: identifier,
  occurred_at: z.string().datetime({ offset: true }),
  actor: identifier,
  sequence: z.number().int().positive().safe(),
};

const careerEventSchema = z.discriminatedUnion("event_type", [
  z.object({ ...common, event_type: z.literal("ExperienceUpserted"), data: experience.nullable() }).passthrough(),
  z.object({ ...common, event_type: z.literal("ExperienceDeleted"), data: experience.nullable() }).passthrough(),
  z.object({ ...common, event_type: z.literal("ProjectUpserted"), data: project.nullable() }).passthrough(),
  z.object({ ...common, event_type: z.literal("ProjectDeleted"), data: project.nullable() }).passthrough(),
  z.object({ ...common, event_type: z.literal("EducationUpserted"), data: education.nullable() }).passthrough(),
  z.object({ ...common, event_type: z.literal("EducationDeleted"), data: education.nullable() }).passthrough(),
  z.object({ ...common, event_type: z.literal("SkillConceptUpserted"), data: skill.nullable() }).passthrough(),
  z.object({ ...common, event_type: z.literal("SkillConceptDeleted"), data: skill.nullable() }).passthrough(),
  z.object({ ...common, event_type: z.literal("ProfileUpserted"), data: profile.nullable() }).passthrough(),
  z.object({ ...common, event_type: z.literal("ProfileDeleted"), data: profile.nullable() }).passthrough(),
]);

export class CareerEventSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CareerEventSchemaError";
  }
}

export function parseCareerEvent(raw: Buffer): CareerEventEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new CareerEventSchemaError("Career event data is not valid JSON");
  }

  const result = careerEventSchema.safeParse(parsed);
  if (!result.success) {
    const field = result.error.issues[0]?.path.join(".") || "event";
    throw new CareerEventSchemaError(`Career event schema rejected ${field}`);
  }

  const envelope = result.data as CareerEventEnvelope;
  if (
    envelope.event_type !== "ProfileUpserted"
    && typeof envelope.data === "object"
    && envelope.data !== null
    && "id" in envelope.data
    && envelope.data.id !== envelope.aggregate_id
  ) {
    throw new CareerEventSchemaError("Career event data id must equal aggregate_id");
  }
  return envelope;
}

/** Compatibility helper for projection-focused callers that prefer a nullable parse. */
export function parseEnvelope(raw: Buffer | null): CareerEventEnvelope | null {
  if (!raw || raw.length === 0) return null;
  try {
    return parseCareerEvent(raw);
  } catch {
    return null;
  }
}
