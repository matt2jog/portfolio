CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_policy_acceptance" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" varchar NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"policy_version" varchar NOT NULL,
	"terms_version" varchar NOT NULL,
	"privacy_version" varchar NOT NULL,
	"accepted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_models" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"model_id" text NOT NULL,
	"provider" text NOT NULL,
	"fireworks_model_id" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_models_model_id_unique" UNIQUE("model_id")
);
--> statement-breakpoint
ALTER TABLE "all_skills" ADD COLUMN IF NOT EXISTS "embedding" vector(768);--> statement-breakpoint
ALTER TABLE "all_skills" ADD COLUMN IF NOT EXISTS "embedding_model" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "ai_system_prompt" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admin_policy_acceptance_unique_idx" ON "admin_policy_acceptance" USING btree ("admin_id","policy_version","terms_version","privacy_version");
