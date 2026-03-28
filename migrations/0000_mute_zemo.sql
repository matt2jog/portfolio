CREATE TABLE "all_skills" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"grouping_id" varchar
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"action" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bio" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"headline" text,
	"description" text,
	"paragraph" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personal_information" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text DEFAULT 'Matthew Tujague' NOT NULL,
	"title" text DEFAULT 'Software Engineer' NOT NULL,
	"location" text DEFAULT 'NJ-NY-PA' NOT NULL,
	"short_bio" text DEFAULT 'Based in Middletown NJ with ties to all of the tri-state, this engineer prefers to scale large systems that promote REAL value.' NOT NULL,
	"email" text DEFAULT 'matthew@2jog.dev' NOT NULL,
	"phone" text DEFAULT '+17326393889' NOT NULL,
	"phone_formatted" text DEFAULT '(732) 639-3889' NOT NULL,
	"linkedin_url" text DEFAULT 'https://linkedin.com/in/matthewtujague' NOT NULL,
	"github_url" text DEFAULT 'https://github.com/binimal101' NOT NULL,
	"devpost_url" text DEFAULT 'https://devpost.com/' NOT NULL,
	"portfolio_url" text DEFAULT 'https://2jog.dev/' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portfolio_skills" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"all_skill_id" varchar NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp,
	"archived_by" varchar
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"long_description" text,
	"tech" text[] DEFAULT '{}'::text[] NOT NULL,
	"image" text,
	"hover_image" text,
	"deployed_url" text,
	"github_url" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"archived_by" varchar
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills_group" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"google_sub" text NOT NULL,
	"name" text,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub")
);
--> statement-breakpoint
CREATE TABLE "xyz_bullets" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" varchar NOT NULL,
	"bullet_text" text NOT NULL
);
