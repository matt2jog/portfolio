ALTER TABLE "projects"
  ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "experiences"
  ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "skills_group"
  ADD COLUMN "position" integer DEFAULT 0 NOT NULL,
  ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL,
  ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "xyz_bullets"
  ADD COLUMN "position" integer DEFAULT 0 NOT NULL,
  ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL,
  ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;
