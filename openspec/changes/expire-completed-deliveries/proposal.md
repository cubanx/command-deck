## Why

Completed webhook delivery receipts currently accumulate indefinitely. Retain 72 hours of completed history while preserving unresolved work and failed-delivery evidence; this bounds completed history without claiming to fix webhook processing latency.

## What Changes

- Expire `done` and `ignored` inbox deliveries 72 hours after `processedAt`, using MongoDB's asynchronous TTL cleanup.
- Apply the same policy to existing completed records without a backfill or application cleanup job.
- Preserve `pending`, `pending_verification`, and `rejected` records, and records without a valid processing timestamp.
- **BREAKING**: Delivery-ID deduplication lasts while the receipt exists. An expired receipt no longer prevents a manually replayed delivery from being accepted again.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mongodb-storage`: Completed inbox retention and an explicit receipt-lifetime deduplication boundary.
- `event-projections`: Explicitly bound delivery-ID deduplication to the retained receipt.

## Impact

Database initialization, MongoDB integration tests, and storage specifications. No new dependencies or background worker. Deployment will make old eligible records subject to deletion; this implementation does not deploy or delete production data. Webhook subscriptions, queue latency, and slow page rendering remain outside this change.
