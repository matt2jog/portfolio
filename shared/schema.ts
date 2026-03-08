import { sql } from "drizzle-orm";
import { integer, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
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
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"),
  archivedBy: varchar("archived_by"),
});

export const xyzBullets = pgTable("xyz_bullets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull(),
  bulletText: text("bullet_text").notNull(),
});

export const bio = pgTable("bio", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  headline: text("headline"),
  description: text("description"),
  paragraph: text("paragraph"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const skills = pgTable("skills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  label: text("label").notNull(),
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
});

export const updateProjectSchema = insertProjectSchema.partial();

export const insertBioSchema = createInsertSchema(bio).pick({
  headline: true,
  description: true,
  paragraph: true,
});

export const insertSkillSchema = createInsertSchema(skills).pick({
  label: true,
});

export const updateSkillSchema = insertSkillSchema.partial();

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type XyzBullet = typeof xyzBullets.$inferSelect;
export type Bio = typeof bio.$inferSelect;
export type Skill = typeof skills.$inferSelect;
