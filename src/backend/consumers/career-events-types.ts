// Transitional wire types for Admin-owned career events consumed from Kafka.
// The checked-in names mirror the legacy topic payload while Admin's generated schemas
// and final topic family are reconciled. Kept intentionally loose (most fields optional) because
// "unknown/newer schema fields ignored" and consumers must tolerate partially-populated
// snapshots rather than reject them.

export type CareerEventType =
  | "ProfileUpserted"
  | "ProfileDeleted"
  | "EducationUpserted"
  | "EducationDeleted"
  | "ExperienceUpserted"
  | "ExperienceDeleted"
  | "ProjectUpserted"
  | "ProjectDeleted"
  | "SkillConceptUpserted"
  | "SkillConceptDeleted";

export interface CareerEventEnvelope<TData = unknown> {
  event_id: string;
  event_type: CareerEventType | string;
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

/**
 * Parses a raw Kafka message value into a career event envelope.
 *
 * Returns `null` for:
 *  - a true tombstone (raw value is `null`/empty — compaction's delete marker), OR
 *  - malformed JSON / a payload missing the required envelope fields.
 *
 * Callers distinguish the two by checking `raw` themselves (tombstones carry no key
 * info here; the caller already has the Kafka message key for that case).
 *
 * Tolerates Confluent/Karapace wire-format framing: schema-registry-aware JSON
 * serializers prefix the payload with a magic byte (0x00) + 4-byte schema id before the
 * JSON body. Valid JSON never starts with 0x00, so we can safely detect and strip it.
 */
export function parseEnvelope(raw: Buffer | null): CareerEventEnvelope | null {
  if (!raw || raw.length === 0) return null;

  let jsonBuf = raw;
  if (raw.length > 5 && raw[0] === 0x00) {
    jsonBuf = raw.subarray(5);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonBuf.toString("utf8"));
  } catch {
    return null;
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as any).event_id !== "string" ||
    typeof (parsed as any).event_type !== "string" ||
    typeof (parsed as any).aggregate_id !== "string"
  ) {
    return null;
  }

  const envelope = parsed as CareerEventEnvelope;
  return { ...envelope, data: envelope.data ?? null };
}
