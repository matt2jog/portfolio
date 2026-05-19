CREATE TABLE IF NOT EXISTS "ip_rate_logs" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ip" text NOT NULL,
  "method" text NOT NULL,
  "path" text NOT NULL,
  "status_code" integer,
  "tracking_ip_id" varchar REFERENCES browser_tracking_ips(id) ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ip_rate_logs_ip_created_idx" ON "ip_rate_logs"("ip", "created_at");
CREATE INDEX IF NOT EXISTS "ip_rate_logs_tracking_ip_id_idx" ON "ip_rate_logs"("tracking_ip_id");
