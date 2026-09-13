## Why

The user document currently owns installations, repositories, PRs, deployments, and OpenSpec evidence. Authentication, dashboard reads, and webhook processing repeatedly retrieve this oversized aggregate and unrelated updates share its write boundary. Correct ownership should remove that coupling; observed latency motivates the change but does not yet prove its precise cause.

## What Changes

- **BREAKING:** replace embedded user projections with shared installation, binding, repository, PR, and deployment documents. Start empty, reconnect, and reconcile; no migration or compatibility layer.
- Keep identity and persistent dashboard preferences on the user. Enforce installation access server-side over shared data.
- Embed OpenSpec evidence in its PR through post-merge completion. Hide unassociated OpenSpecs.
- Put ETags with the data they validate, preserving pagination correctness without a generic duplicate response store.
- Keep independent authentication/action records, webhook receipts, and reconciliation runs. Retain completed receipts for 72 hours and record processing timing.
- Remove browser notification infrastructure and controls; retain authenticated live card refresh.
- Rebuild open PRs and merged PRs with outstanding obligations on clean reconciliation. Validate document isolation and measure request latency before and after.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mongodb-storage`: domain ownership, independent updates, bounded documents, clean initialization, receipt lifecycle.
- `developer-access`: shared data authorization through separate installation bindings.
- `provider-reconciliation`: domain-scoped refresh, colocated validators, shared run evidence, clean reconstruction.
- `event-projections`: repeatable document updates and durable processing completion.
- `openspec-progress`: PR-owned progress through merge; no unassociated projection or completion notification.
- `command-center-dashboard`: user-stored preferences, narrow reads, removal of notification controls.
- `transition-notifications`: remove notification behavior while retaining authorized SSE refresh.

## Impact

Affects Mongo schemas/indexes, authentication and installation binding, webhook projection, GitHub reconciliation/cache consumers, snapshot assembly, frontend preferences and live events, demo fixtures, and tests. No new service or dependency is planned. Production reset and deployment are separately gated post-merge operations. The existing `expire-completed-deliveries` change overlaps receipt retention; implementation must resolve that overlap on current main rather than publish unrelated branch history or assume stacked-PR approval.
