## Why

PR23's natural production errors identify persistence but cannot distinguish aggregate contention from driver failures. The separate webhook drain path still emits raw exception messages.

## What Changes

- Add finite failure classifications, validated numeric codes/status, and numeric PR targets to existing diagnostics.
- Sanitize webhook drain errors through the shared JSON logger while preserving failure and recovery behavior.
- Preserve retry limits, serialization, and existing diagnostic ownership.

## Capabilities

### New Capabilities

- `reconciliation-failure-details`: Safe classification and target propagation for reconciliation and drain failures.

### Modified Capabilities

None.

## Impact

Shared reconciliation diagnostics, GitHub persistence reporting, server drain/stage boundaries, and regression tests. No dependencies or provider operations. PR23 acceptance evidence remains in its original checkout.
