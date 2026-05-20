CREATE TABLE IF NOT EXISTS "welcome_messages" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "label" text NOT NULL,
  "message" text NOT NULL,
  "archived_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "welcome_messages_slug_idx" ON "welcome_messages"("slug");
CREATE INDEX IF NOT EXISTS "welcome_messages_archived_at_idx" ON "welcome_messages"("archived_at");
