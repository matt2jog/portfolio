import { sql } from "drizzle-orm";
import { varchar, boolean, timestamp, pgTable } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const adminPolicyAcceptance = pgTable("admin_policy_acceptance", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  policyVersion: varchar("policy_version").notNull(),
  termsVersion: varchar("terms_version").notNull(),
  privacyVersion: varchar("privacy_version").notNull(),
  accepted: boolean("accepted").notNull().default(false),
});

export const insertAdminPolicyAcceptanceSchema = createInsertSchema(adminPolicyAcceptance).pick({
  adminId: true,
  policyVersion: true,
  termsVersion: true,
  privacyVersion: true,
  accepted: true,
});

export type AdminPolicyAcceptance = typeof adminPolicyAcceptance.$inferSelect;
export type InsertAdminPolicyAcceptance = typeof insertAdminPolicyAcceptanceSchema._type;
