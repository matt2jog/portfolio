# Portfolio career Pub/Sub consumer

Portfolio consumes Admin Dashboard's unchanged v1 career-event JSON bytes through
one authenticated Google Pub/Sub push subscription. The stable target is
`POST /internal/pubsub/career` on the Cloud Run service origin. This is the only
origin path that bypasses the Cloudflare credential gate; it instead fails closed on
Google RS256 OIDC verification for one exact audience and push service-account email.

## Transport checks

The handler accepts only the standard wrapped JSON push envelope. It requires:

- the exact `CAREER_PUBSUB_SUBSCRIPTION` resource name;
- canonical base64 `message.data` containing a valid v1 career event;
- message attributes `contract_version=1`, matching `event_type`, and a nonempty
  `producer_release`;
- `message.orderingKey` equal to the inner `aggregate_id`;
- a positive `deliveryAttempt` when present; and
- an optional non-negative `replay_epoch` that never replaces the original event ID.

Forwarded dead-letter wrappers are not projected by the live endpoint. The dedicated
dead-letter subscription is an operator/debug boundary. Malformed transport or event
data returns 400, and a request naming another subscription returns 403. A candidate
revision has no push target; exact audience and subscription checks prevent candidate
fixtures from being accepted as production delivery.

## Transaction and responses

`portfolio-career-v1` processes each accepted delivery in one short transaction:

1. Insert or lock `(consumer, event_id)` in `career_event_inbox`.
2. Compare the SHA-256 digest of the exact decoded event bytes.
3. Insert and lock `(consumer, aggregate_id)` in `career_event_checkpoints`.
4. Require `sequence = checkpoint.aggregate_version + 1`.
5. Update only Portfolio's Admin-owned career projection fields.
6. Advance the checkpoint and mark the inbox row applied.
7. Commit before returning 204.

The same event ID and digest returns 204 without projecting again. The same event ID
with another digest inserts digest-only evidence in `career_event_quarantine` and
returns 204. A gap or stale version records retry evidence in the inbox and returns
409. A projection or database failure rolls the transaction back and returns 503 with
`Retry-After: 5`. Logs contain event, aggregate, and Pub/Sub message IDs but never the
event body, bearer token, database parameters, or credentials.

Migration `0015_career_pubsub_consumer.sql` is DDL-only and emits no domain event. The
runtime role needs only:

- `SELECT`, `INSERT`, and `UPDATE` on `career_event_inbox`;
- `SELECT`, `INSERT`, and `UPDATE` on `career_event_checkpoints`; and
- `INSERT` on `career_event_quarantine`.

The runtime role receives no delete, truncate, ownership, sequence, DDL, or grant-option
privilege on these controls. Migration and test identities perform bounded cleanup.

## Verification

Focused unit coverage exercises valid and rejected OIDC principals, malformed base64,
JSON and schemas, duplicate digests, digest conflicts, version gaps and stale versions,
delete events, replay epochs, forwarded dead-letter input, candidate isolation, and
non-2xx transient responses. The PostgreSQL integration test proves rollback before
commit and duplicate no-op behavior after a committed response is lost.
