CREATE TABLE IF NOT EXISTS "browser_tracking" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "hashed_uuid" text NOT NULL UNIQUE,
  "tr_en" text,
  "consented_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "browser_tracking_ips" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "hashed_uuid" text NOT NULL,
  "ip" text NOT NULL,
  "first_seen_at" timestamp DEFAULT now() NOT NULL,
  "last_seen_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "browser_tracking_ips_uuid_ip_unique" UNIQUE("hashed_uuid", "ip")
);

CREATE INDEX IF NOT EXISTS "browser_tracking_ips_uuid_idx" ON "browser_tracking_ips"("hashed_uuid");

CREATE TABLE IF NOT EXISTS "browser_request_logs" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "hashed_uuid" text NOT NULL,
  "ip" text,
  "method" text NOT NULL,
  "path" text NOT NULL,
  "status_code" integer,
  "duration_ms" integer,
  "meta" jsonb DEFAULT '{}' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "browser_request_logs_uuid_idx" ON "browser_request_logs"("hashed_uuid");
