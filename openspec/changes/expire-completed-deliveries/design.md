## Context

See proposal.md for motivation. `initializeDatabase` already manages TTL indexes for sessions, OAuth states, merge intents, and reconciliation runs. Inbox intake uses `github:<deliveryId>` as its unique `_id`; no separate deduplication ledger exists. Both webhook projection and reconciliation repair set `processedAt` when they mark a delivery `done`; unsupported events become `ignored`. Failed GitHub work remains `pending_verification`; `rejected` records also represent failed work and must be preserved.

## Goals / Non-Goals

**Goals:** Use existing completion timestamps for retention, including existing records, without changing producers or retry scheduling.

**Non-Goals:** Queue throughput, webhook subscription filtering, dashboard load time, permanent replay protection, and production execution.

## Decisions

- Add one single-field TTL index on `processedAt`, `expireAfterSeconds: 259200`, with `partialFilterExpression: { status: { $in: ["done", "ignored"] } }`. Using `receivedAt` would erase old work immediately after eventual processing. An unconditional `processedAt` index could delete rejected deliveries. A new expiry field would require changes to every completion path and a backfill; neither is necessary.
- MongoDB performs asynchronous deletion, not an exact 72-hour timer. Missing/non-date timestamps do not expire. See [MongoDB TTL documentation](https://www.mongodb.com/docs/manual/core/index-ttl/).
- Receipt deletion ends delivery-ID deduplication. Document this explicit 72-hour minimum retention window; while MongoDB still retains an eligible receipt, duplicates remain suppressed. After deletion, a valid replay is accepted again through normal intake. Do not introduce another indefinitely growing tombstone collection.
- Test the real MongoDB TTL monitor, retaining all protected statuses even with old `processedAt` values. Seed eligible records before installing the new index to cover existing data, then verify repeated initialization and duplicate behavior before and after expiry.

## Risks / Trade-offs

- Old manual replays can reapply stale event data after their receipts expire; this change does not add chronological guards to all projections. Avoid replaying expired deliveries; recover current state with reconciliation instead.
- 72-hour-old completed diagnostic evidence is deleted irreversibly. Unresolved and rejected evidence remains available.
- Creating the index makes all existing eligible records available for asynchronous deletion, which can temporarily add database load. Inspect aggregate eligibility and status counts during authorized rollout; do not claim retention fixes the observed processing delay.

## Migration Plan

After merge, deployment of the exact merged revision creates the index through normal initialization; no manual delete or backfill is needed. Production execution and verification require separate authorization. Verify index options, eligible-record reduction after TTL passes, and preservation of protected statuses. Rolling code back alone does not remove a MongoDB index: stopping retention requires an authorized drop of this specific TTL index. Deleted receipts cannot be restored by rollback; user projections are not deleted.
