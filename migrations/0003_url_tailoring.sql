CREATE TABLE "url_tailoring" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tag" text NOT NULL,
	"param" text NOT NULL,
	"start_page" text DEFAULT '/' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "url_tailoring_tag_unique" UNIQUE("tag"),
	CONSTRAINT "url_tailoring_param_unique" UNIQUE("param")
);
