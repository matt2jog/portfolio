-- Consolidate request tracking into ip_rate_logs as the single source of truth.
-- Drop the browser_tracking_ips FK (unreliable after restart; warm-cache was never
-- guaranteed), add hashed_uuid (always available from cookie), duration_ms, and meta.

ALTER TABLE "ip_rate_logs"
  DROP COLUMN IF EXISTS "tracking_ip_id",
  ALTER COLUMN "ip" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "hashed_uuid" text,
  ADD COLUMN IF NOT EXISTS "duration_ms" integer,
  ADD COLUMN IF NOT EXISTS "meta" jsonb DEFAULT '{}';

-- Index for per-UUID request history
CREATE INDEX IF NOT EXISTS "ip_rate_logs_uuid_created_idx"
  ON "ip_rate_logs" ("hashed_uuid", "created_at")
  WHERE "hashed_uuid" IS NOT NULL;
