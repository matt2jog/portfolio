import { sql } from "drizzle-orm";
import { integer, jsonb, pgSchema, text, timestamp, varchar, boolean, uniqueIndex, vector } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { portfolioDatabaseBoundary } from "./database-boundary";

const portfolioSchema = pgSchema(portfolioDatabaseBoundary().schema);

export const users = portfolioSchema.table("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  auth0Sub: text("auth0_sub").unique(),
  name: text("name"),
  role: text("role").notNull().default("user"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  auth0Sub: true,
  name: true,
  role: true,
});

export const projects = portfolioSchema.table("projects", {
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
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
  archivedBy: varchar("archived_by"),
});

export const aiModels = portfolioSchema.table("ai_models", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  label: text("label").notNull(),
  modelId: text("model_id").notNull().unique(),
  provider: text("provider").notNull(),
  fireworksModelId: text("fireworks_model_id"),
  enabled: boolean("enabled").notNull().default(true),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const xyzBullets = portfolioSchema.table("xyz_bullets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  bulletText: text("bullet_text").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const bio = portfolioSchema.table("bio", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  headline: text("headline"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const bioParagraphs = portfolioSchema.table("bio_paragraphs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bioId: varchar("bio_id").notNull(),
  content: text("content").notNull(),
  position: integer("position").notNull().default(0),
});

export const skillsGroup = portfolioSchema.table("skills_group", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const allSkills = portfolioSchema.table("all_skills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  groupingId: varchar("grouping_id").references(() => skillsGroup.id, { onDelete: "set null" }),
  embedding: vector("embedding", { dimensions: 768 }),
  embeddingModel: text("embedding_model"),
});
export const portfolioSkills = portfolioSchema.table("portfolio_skills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  allSkillId: varchar("all_skill_id").notNull().references(() => allSkills.id, { onDelete: "restrict" }),
  groupId: varchar("group_id").references(() => skillsGroup.id, { onDelete: "set null" }),
  position: integer("position").notNull().default(0),
  deletedAt: timestamp("deleted_at"),
  archivedBy: varchar("archived_by"),
});

export const auditLogs = portfolioSchema.table("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  action: text("action").notNull(),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
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
}).extend({
  name: z.string().trim().min(1).max(80),
});

export const updateSkillsGroupSchema = insertSkillsGroupSchema.partial();

export const insertAllSkillSchema = createInsertSchema(allSkills).pick({
  name: true,
  groupingId: true,
}).extend({
  name: z.string().trim().min(1).max(120),
  groupingId: z.string().min(1).nullable().optional(),
});

export const updateAllSkillSchema = insertAllSkillSchema.partial();

export const insertPortfolioSkillSchema = createInsertSchema(portfolioSkills).pick({
  allSkillId: true,
  groupId: true,
}).extend({
  allSkillId: z.string().min(1),
  groupId: z.string().min(1),
});

export const updatePortfolioSkillSchema = insertPortfolioSkillSchema.partial();

export const githubTimelineEvents = portfolioSchema.table("github_timeline_events", {
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

export const linkedinTimelineEvents = portfolioSchema.table("linkedin_timeline_events", {
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

export const personalInformation = portfolioSchema.table("personal_information", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  title: text("title").notNull(),
  location: text("location").notNull(),
  shortBio: text("short_bio").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  phoneFormatted: text("phone_formatted").notNull(),
  linkedinUrl: text("linkedin_url").notNull(),
  githubUrl: text("github_url").notNull(),
  devpostUrl: text("devpost_url").notNull(),
  portfolioUrl: text("portfolio_url").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPersonalInformationSchema = createInsertSchema(personalInformation).omit({ id: true, updatedAt: true });
export const updatePersonalInformationSchema = insertPersonalInformationSchema.partial();

export const adminPolicyAcceptance = portfolioSchema.table(
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

// Resume reads this career presentation data through the private views in the
// Portfolio schema.
export const education = portfolioSchema.table("education", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  school: text("school").notNull(),
  location: text("location").notNull(),
  degree: text("degree").notNull(),
  dates: text("dates").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Education = typeof education.$inferSelect;

export const experiences = portfolioSchema.table("experiences", {
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
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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

export const legalDocumentVersions = portfolioSchema.table(
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

export const browserTracking = portfolioSchema.table("browser_tracking", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hashedUuid: text("hashed_uuid").notNull().unique(),
  trEn: text("tr_en"),
  consentedAt: timestamp("consented_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type BrowserTracking = typeof browserTracking.$inferSelect;

// ─── Welcome Messages (Personalization) ──────────────────────────────────────

export const welcomeMessages = portfolioSchema.table("welcome_messages", {
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
