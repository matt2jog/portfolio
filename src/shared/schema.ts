import { sql } from "drizzle-orm";
import { integer, jsonb, pgTable, text, timestamp, varchar, boolean, uniqueIndex, vector } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  googleSub: text("google_sub").notNull().unique(),
  name: text("name"),
  role: text("role").notNull().default("user"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  googleSub: true,
  name: true,
  role: true,
});

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  longDescription: text("long_description"),
  tech: text("tech").array().notNull().default(sql`'{}'::text[]`),
  image: text("image"),
  hoverImage: text("hover_image"),
  deployedUrl: text("deployed_url"),
  githubUrl: text("github_url"),
  aiSystemPrompt: text("ai_system_prompt"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
  archivedBy: varchar("archived_by"),
});

export const aiModels = pgTable("ai_models", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  label: text("label").notNull(),
  modelId: text("model_id").notNull().unique(),
  provider: text("provider").notNull(),
  fireworksModelId: text("fireworks_model_id"),
  enabled: boolean("enabled").notNull().default(true),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const xyzBullets = pgTable("xyz_bullets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  bulletText: text("bullet_text").notNull(),
});

export const bio = pgTable("bio", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  headline: text("headline"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const bioParagraphs = pgTable("bio_paragraphs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bioId: varchar("bio_id").notNull(),
  content: text("content").notNull(),
  position: integer("position").notNull().default(0),
});

export const skillsGroup = pgTable("skills_group", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
});

export const allSkills = pgTable("all_skills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  groupingId: varchar("grouping_id"),
  embedding: vector("embedding", { dimensions: 768 }),
  embeddingModel: text("embedding_model"),
});

export const portfolioSkills = pgTable("portfolio_skills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  allSkillId: varchar("all_skill_id").notNull(),
  position: integer("position").notNull().default(0),
  deletedAt: timestamp("deleted_at"),
  archivedBy: varchar("archived_by"),
});

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  action: text("action").notNull(),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const session = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire").notNull(),
});

export const insertProjectSchema = createInsertSchema(projects).pick({
  title: true,
  category: true,
  description: true,
  longDescription: true,
  tech: true,
  image: true,
  hoverImage: true,
  deployedUrl: true,
  githubUrl: true,
  aiSystemPrompt: true,
});

export const insertAiModelSchema = createInsertSchema(aiModels).pick({
  label: true,
  modelId: true,
  provider: true,
  enabled: true,
});

export const updateProjectSchema = insertProjectSchema.partial();

export const insertBioSchema = createInsertSchema(bio).pick({
  headline: true,
}).extend({
  paragraphs: z.array(z.string()).optional(),
});

export const insertBioParagraphSchema = createInsertSchema(bioParagraphs).pick({
  content: true,
  position: true,
});

export const insertSkillsGroupSchema = createInsertSchema(skillsGroup).pick({
  name: true,
});

export const updateSkillsGroupSchema = insertSkillsGroupSchema.partial();

export const insertAllSkillSchema = createInsertSchema(allSkills).pick({
  name: true,
  groupingId: true,
});

export const updateAllSkillSchema = insertAllSkillSchema.partial();

export const insertPortfolioSkillSchema = createInsertSchema(portfolioSkills).pick({
  allSkillId: true,
});

export const updatePortfolioSkillSchema = insertPortfolioSkillSchema.partial();

export const githubTimelineEvents = pgTable("github_timeline_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  extId: varchar("ext_id").notNull().unique(), // GitHub event ID
  type: text("type").notNull(), // commit, pr, repo
  title: text("title").notNull(),
  description: text("description"),
  url: text("url"),
  repo: text("repo").notNull(),
  timestamp: timestamp("timestamp").notNull(),
  meta: jsonb("meta").default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertGithubTimelineEventSchema = createInsertSchema(githubTimelineEvents).omit({ id: true, createdAt: true });

export const linkedinTimelineEvents = pgTable("linkedin_timeline_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  extId: varchar("ext_id").notNull().unique(),
  type: text("type").notNull(), // post, repost, article
  title: text("title").notNull(),
  description: text("description"),
  url: text("url"),
  source: text("source").notNull(),
  timestamp: timestamp("timestamp").notNull(),
  meta: jsonb("meta").default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertLinkedinTimelineEventSchema = createInsertSchema(linkedinTimelineEvents).omit({ id: true, createdAt: true });

export const personalInformation = pgTable("personal_information", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().default("Matthew Tujague"),
  title: text("title").notNull().default("Software Engineer"),
  location: text("location").notNull().default("NJ-NY-PA"),
  shortBio: text("short_bio").notNull().default("Based in Middletown NJ with ties to all of the tri-state, this engineer prefers to scale large systems that promote REAL value."),
  email: text("email").notNull().default("matthew@2jog.dev"),
  phone: text("phone").notNull().default("+17326393889"),
  phoneFormatted: text("phone_formatted").notNull().default("(732) 639-3889"),
  linkedinUrl: text("linkedin_url").notNull().default("https://linkedin.com/in/matthewtujague"),
  githubUrl: text("github_url").notNull().default("https://github.com/binimal101"),
  devpostUrl: text("devpost_url").notNull().default("https://devpost.com/"),
  portfolioUrl: text("portfolio_url").notNull().default("https://2jog.dev/"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPersonalInformationSchema = createInsertSchema(personalInformation).omit({ id: true, updatedAt: true });
export const updatePersonalInformationSchema = insertPersonalInformationSchema.partial();

export const adminPolicyAcceptance = pgTable(
  "admin_policy_acceptance",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    adminId: varchar("admin_id").notNull(),
    timestamp: timestamp("timestamp").defaultNow().notNull(),
    policyVersion: varchar("policy_version").notNull(),
    termsVersion: varchar("terms_version").notNull(),
    privacyVersion: varchar("privacy_version").notNull(),
    accepted: boolean("accepted").notNull().default(false),
  },
  (table) => [
    uniqueIndex("admin_policy_acceptance_unique_idx").on(
      table.adminId,
      table.policyVersion,
      table.termsVersion,
      table.privacyVersion,
    ),
  ],
);

export const insertAdminPolicyAcceptanceSchema = createInsertSchema(adminPolicyAcceptance).pick({
  adminId: true,
  policyVersion: true,
  termsVersion: true,
  privacyVersion: true,
  accepted: true,
});

export type AdminPolicyAcceptance = typeof adminPolicyAcceptance.$inferSelect;
export type InsertAdminPolicyAcceptance = typeof insertAdminPolicyAcceptanceSchema._type;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type XyzBullet = typeof xyzBullets.$inferSelect;
export type Bio = typeof bio.$inferSelect;
export type BioParagraph = typeof bioParagraphs.$inferSelect;
export type SkillsGroup = typeof skillsGroup.$inferSelect;
export type AllSkill = typeof allSkills.$inferSelect;
export type PortfolioSkill = typeof portfolioSkills.$inferSelect;
export type GithubTimelineEvent = typeof githubTimelineEvents.$inferSelect;
export type LinkedinTimelineEvent = typeof linkedinTimelineEvents.$inferSelect;
export type AiModel = typeof aiModels.$inferSelect;

export const experiences = pgTable("experiences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  role: text("role").notNull(),
  company: text("company").notNull(),
  location: text("location").notNull().default("Remote"),
  duration: text("duration").notNull(),
  description: text("description").notNull(),
  technologies: text("technologies").array().notNull().default(sql`'{}'::text[]`),
  isActive: boolean("is_active").notNull().default(false),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertExperienceSchema = createInsertSchema(experiences).pick({
  role: true,
  company: true,
  location: true,
  duration: true,
  description: true,
  technologies: true,
  isActive: true,
});

export const updateExperienceSchema = insertExperienceSchema.partial();
export type DbExperience = typeof experiences.$inferSelect;

export const legalDocumentVersions = pgTable(
  "legal_document_versions",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    docType: text("doc_type").notNull(),
    content: text("content").notNull(),
    contentHash: text("content_hash").notNull(),
    commitSha: text("commit_sha").notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueDocHash: uniqueIndex("legal_document_versions_doc_type_content_hash_key").on(
      t.docType,
      t.contentHash,
    ),
  }),
);

export type DbLegalDocumentVersion = typeof legalDocumentVersions.$inferSelect;

// ─── Browser Tracking ────────────────────────────────────────────────────────

export const browserTracking = pgTable("browser_tracking", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hashedUuid: text("hashed_uuid").notNull().unique(),
  trEn: text("tr_en"),
  consentedAt: timestamp("consented_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const browserTrackingIps = pgTable(
  "browser_tracking_ips",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    hashedUuid: text("hashed_uuid").notNull(),
    ip: text("ip").notNull(),
    firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("browser_tracking_ips_uuid_ip_idx").on(t.hashedUuid, t.ip)],
);

export const browserRequestLogs = pgTable("browser_request_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hashedUuid: text("hashed_uuid").notNull(),
  ip: text("ip"),
  method: text("method").notNull(),
  path: text("path").notNull(),
  statusCode: integer("status_code"),
  durationMs: integer("duration_ms"),
  meta: jsonb("meta").default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const ipRateLogs = pgTable("ip_rate_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ip: text("ip"),
  hashedUuid: text("hashed_uuid"),
  method: text("method").notNull(),
  path: text("path").notNull(),
  statusCode: integer("status_code"),
  durationMs: integer("duration_ms"),
  meta: jsonb("meta").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type BrowserTracking = typeof browserTracking.$inferSelect;
export type BrowserTrackingIp = typeof browserTrackingIps.$inferSelect;
export type BrowserRequestLog = typeof browserRequestLogs.$inferSelect;
export type IpRateLog = typeof ipRateLogs.$inferSelect;

// ─── Welcome Messages (Personalization) ──────────────────────────────────────

export const welcomeMessages = pgTable("welcome_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  label: text("label").notNull(),
  message: text("message").notNull(),
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertWelcomeMessageSchema = createInsertSchema(welcomeMessages).pick({
  slug: true,
  label: true,
  message: true,
});

export const updateWelcomeMessageSchema = insertWelcomeMessageSchema.partial();

export type WelcomeMessage = typeof welcomeMessages.$inferSelect;
