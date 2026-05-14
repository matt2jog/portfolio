CREATE TABLE "admin_policy_acceptance" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" varchar NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"policy_version" varchar NOT NULL,
	"terms_version" varchar NOT NULL,
	"privacy_version" varchar NOT NULL,
	"accepted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "admin_policy_acceptance_unique_idx" ON "admin_policy_acceptance" ("admin_id","policy_version","terms_version","privacy_version");
