CREATE TABLE "education" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school" text NOT NULL,
	"location" text NOT NULL,
	"degree" text NOT NULL,
	"dates" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
