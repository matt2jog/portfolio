CREATE TABLE "career_event_inbox" (
	"consumer" text NOT NULL,
	"event_id" text NOT NULL,
	"payload_digest" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"aggregate_version" bigint NOT NULL,
	"event_type" text NOT NULL,
	"first_message_id" text NOT NULL,
	"last_message_id" text NOT NULL,
	"subscription" text NOT NULL,
	"ordering_key" text NOT NULL,
	"contract_version" text NOT NULL,
	"producer_release" text NOT NULL,
	"replay_epoch" bigint,
	"delivery_attempt" integer,
	"authenticated_principal" text,
	"authentication_assertion_digest" text,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"error_code" text,
	"observed_checkpoint_version" bigint,
	"expected_aggregate_version" bigint,
	"first_received_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"last_received_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	"last_error_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	CONSTRAINT "career_event_inbox_payload_digest_check"
		CHECK ("payload_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "career_event_inbox_aggregate_version_check"
		CHECK ("aggregate_version" > 0),
	CONSTRAINT "career_event_inbox_replay_epoch_check"
		CHECK ("replay_epoch" IS NULL OR "replay_epoch" >= 0),
	CONSTRAINT "career_event_inbox_delivery_attempt_check"
		CHECK ("delivery_attempt" IS NULL OR "delivery_attempt" > 0),
	CONSTRAINT "career_event_inbox_assertion_digest_check"
		CHECK (
			"authentication_assertion_digest" IS NULL
			OR "authentication_assertion_digest" ~ '^[0-9a-f]{64}$'
		),
	CONSTRAINT "career_event_inbox_status_check"
		CHECK ("status" IN ('processing', 'applied', 'version_gap', 'stale')),
	CONSTRAINT "career_event_inbox_attempts_check"
		CHECK ("attempts" > 0),
	CONSTRAINT "career_event_inbox_version_evidence_check"
		CHECK (
			("observed_checkpoint_version" IS NULL AND "expected_aggregate_version" IS NULL)
			OR (
				"observed_checkpoint_version" >= 0
				AND "expected_aggregate_version" = "observed_checkpoint_version" + 1
			)
		),
	PRIMARY KEY ("consumer", "event_id")
);
--> statement-breakpoint
CREATE TABLE "career_event_checkpoints" (
	"consumer" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"aggregate_version" bigint NOT NULL,
	"event_id" text,
	"payload_digest" text,
	"replay_epoch" bigint,
	"updated_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "career_event_checkpoints_version_check"
		CHECK ("aggregate_version" >= 0),
	CONSTRAINT "career_event_checkpoints_digest_check"
		CHECK ("payload_digest" IS NULL OR "payload_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "career_event_checkpoints_replay_epoch_check"
		CHECK ("replay_epoch" IS NULL OR "replay_epoch" >= 0),
	CONSTRAINT "career_event_checkpoints_state_check"
		CHECK (
			("aggregate_version" = 0 AND "event_id" IS NULL AND "payload_digest" IS NULL)
			OR ("aggregate_version" > 0 AND "event_id" IS NOT NULL AND "payload_digest" IS NOT NULL)
		),
	PRIMARY KEY ("consumer", "aggregate_id")
);
--> statement-breakpoint
CREATE TABLE "career_event_quarantine" (
	"consumer" text NOT NULL,
	"event_id" text NOT NULL,
	"expected_digest" text NOT NULL,
	"observed_digest" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"aggregate_version" bigint NOT NULL,
	"event_type" text NOT NULL,
	"observed_message_id" text NOT NULL,
	"subscription" text NOT NULL,
	"reason" text NOT NULL,
	"quarantined_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
	CONSTRAINT "career_event_quarantine_expected_digest_check"
		CHECK ("expected_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "career_event_quarantine_observed_digest_check"
		CHECK ("observed_digest" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "career_event_quarantine_distinct_digest_check"
		CHECK ("expected_digest" <> "observed_digest"),
	CONSTRAINT "career_event_quarantine_version_check"
		CHECK ("aggregate_version" > 0),
	CONSTRAINT "career_event_quarantine_reason_check"
		CHECK ("reason" = 'digest_conflict'),
	PRIMARY KEY ("consumer", "event_id", "observed_digest")
);
