CREATE TABLE "bio_paragraphs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bio_id" varchar NOT NULL,
	"content" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bio" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "bio" DROP COLUMN "paragraph";