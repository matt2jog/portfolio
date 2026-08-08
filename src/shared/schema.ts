import { sql } from "drizzle-orm";
import { integer, text, uniqueIndex, sqliteTable } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

const id = (name = "id") => text(name).primaryKey().default(sql`lower(hex(randomblob(16)))`);
const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" })
  .notNull()
  .default(sql`(unixepoch() * 1000)`);

export const users = sqliteTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  auth0Sub: text("auth0_sub").unique(),
  name: text("name"),
  role: text("role").notNull().default("user"),
  createdAt: timestamp("created_at"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  auth0Sub: true,
  name: true,
  role: true,
});

export const projects = sqliteTable("projects", {
  id: id(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  longDescription: text("long_description"),
  tech: text("tech", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  image: text("image"),
  hoverImage: text("hover_image"),
  deployedUrl: text("deployed_url"),
  githubUrl: text("github_url"),
  aiSystemPrompt: text("ai_system_prompt"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  archivedBy: text("archived_by"),
});

export const aiModels = sqliteTable("ai_models", {
  id: id(),
  label: text("label").notNull(),
  modelId: text("model_id").notNull().unique(),
  provider: text("provider").notNull(),
  fireworksModelId: text("fireworks_model_id"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at"),
});

export const xyzBullets = sqliteTable("xyz_bullets", {
  id: id(),
  projectId: text("project_id").notNull(),
  bulletText: text("bullet_text").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const experienceBullets = sqliteTable("experience_bullets", {
  id: id(),
  experienceId: text("experience_id").notNull(),
  bulletText: text("bullet_text").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const bio = sqliteTable("bio", {
  id: id(),
  headline: text("headline"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const bioParagraphs = sqliteTable("bio_paragraphs", {
  id: id(),
  bioId: text("bio_id").notNull(),
  content: text("content").notNull(),
  position: integer("position").notNull().default(0),
});

export const skillsGroup = sqliteTable("skills_group", {
  id: id(),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const allSkills = sqliteTable("all_skills", {
  id: id(),
  name: text("name").notNull(),
  groupingId: text("grouping_id").references(() => skillsGroup.id, { onDelete: "set null" }),
  embedding: text("embedding", { mode: "json" }).$type<number[] | null>(),
  embeddingModel: text("embedding_model"),
});

export const portfolioSkills = sqliteTable("portfolio_skills", {
  id: id(),
  allSkillId: text("all_skill_id").notNull().references(() => allSkills.id, { onDelete: "restrict" }),
  groupId: text("group_id").references(() => skillsGroup.id, { onDelete: "set null" }),
  position: integer("position").notNull().default(0),
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  archivedBy: text("archived_by"),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: id(),
  userId: text("user_id").notNull(),
  action: text("action").notNull(),
  payload: text("payload", { mode: "json" }).$type<unknown>(),
  createdAt: timestamp("created_at"),
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

export const insertBioSchema = createInsertSchema(bio).pick({ headline: true }).extend({
  paragraphs: z.array(z.string()).optional(),
});

export const insertBioParagraphSchema = createInsertSchema(bioParagraphs).pick({
  content: true,
  position: true,
});

export const insertSkillsGroupSchema = createInsertSchema(skillsGroup).pick({ name: true }).extend({
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

export const githubTimelineEvents = sqliteTable("github_timeline_events", {
  id: id(),
  extId: text("ext_id").notNull().unique(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  url: text("url"),
  repo: text("repo").notNull(),
  timestamp: timestamp("timestamp"),
  meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
  createdAt: timestamp("created_at"),
});
export const insertGithubTimelineEventSchema = createInsertSchema(githubTimelineEvents).omit({ id: true, createdAt: true });

export const linkedinTimelineEvents = sqliteTable("linkedin_timeline_events", {
  id: id(),
  extId: text("ext_id").notNull().unique(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  url: text("url"),
  source: text("source").notNull(),
  timestamp: timestamp("timestamp"),
  meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
  createdAt: timestamp("created_at"),
});
export const insertLinkedinTimelineEventSchema = createInsertSchema(linkedinTimelineEvents).omit({ id: true, createdAt: true });

export const personalInformation = sqliteTable("personal_information", {
  id: id(),
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
  updatedAt: timestamp("updated_at"),
});
export const insertPersonalInformationSchema = createInsertSchema(personalInformation).omit({ id: true, updatedAt: true });
export const updatePersonalInformationSchema = insertPersonalInformationSchema.partial();

export const adminPolicyAcceptance = sqliteTable("admin_policy_acceptance", {
  id: id(),
  adminId: text("admin_id").notNull(),
  timestamp: timestamp("timestamp"),
  policyVersion: text("policy_version").notNull(),
  termsVersion: text("terms_version").notNull(),
  privacyVersion: text("privacy_version").notNull(),
  accepted: integer("accepted", { mode: "boolean" }).notNull().default(false),
}, (table) => [
  uniqueIndex("admin_policy_acceptance_unique_idx").on(
    table.adminId,
    table.policyVersion,
    table.termsVersion,
    table.privacyVersion,
  ),
]);
export const insertAdminPolicyAcceptanceSchema = createInsertSchema(adminPolicyAcceptance).pick({
  adminId: true,
  policyVersion: true,
  termsVersion: true,
  privacyVersion: true,
  accepted: true,
});

export const education = sqliteTable("education", {
  id: id(),
  school: text("school").notNull(),
  location: text("location").notNull(),
  degree: text("degree").notNull(),
  dates: text("dates").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const experiences = sqliteTable("experiences", {
  id: id(),
  role: text("role").notNull(),
  company: text("company").notNull(),
  location: text("location").notNull().default("Remote"),
  duration: text("duration").notNull(),
  description: text("description").notNull(),
  technologies: text("technologies", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(false),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
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

export const legalDocumentVersions = sqliteTable("legal_document_versions", {
  id: id(),
  docType: text("doc_type").notNull(),
  content: text("content").notNull(),
  contentHash: text("content_hash").notNull(),
  commitSha: text("commit_sha").notNull(),
  committedAt: timestamp("committed_at"),
  recordedAt: timestamp("recorded_at"),
}, (table) => [
  uniqueIndex("legal_document_versions_doc_type_content_hash_key").on(table.docType, table.contentHash),
]);

export const browserTracking = sqliteTable("browser_tracking", {
  id: id(),
  hashedUuid: text("hashed_uuid").notNull().unique(),
  trEn: text("tr_en"),
  consentedAt: integer("consented_at", { mode: "timestamp_ms" }),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const welcomeMessages = sqliteTable("welcome_messages", {
  id: id(),
  slug: text("slug").notNull().unique(),
  label: text("label").notNull(),
  message: text("message").notNull(),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});
export const insertWelcomeMessageSchema = createInsertSchema(welcomeMessages).pick({
  slug: true,
  label: true,
  message: true,
});
export const updateWelcomeMessageSchema = insertWelcomeMessageSchema.partial();

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
export type Education = typeof education.$inferSelect;
export type DbExperience = typeof experiences.$inferSelect;
export type DbLegalDocumentVersion = typeof legalDocumentVersions.$inferSelect;
export type WelcomeMessage = typeof welcomeMessages.$inferSelect;
