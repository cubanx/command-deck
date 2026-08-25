## Why

GitHub can omit `installation.account` from otherwise valid signed webhook payloads. Command Center currently returns HTTP 202 while discarding those deliveries before persistence, leaving projections stale until reconciliation repairs them.

## What Changes

- Accept a signed delivery without `installation.account.login` when its installation bindings resolve to one approved account identity, including bindings shared by multiple Command Center users.
- Continue rejecting deliveries whose installation identity is unbound, ambiguous, or inconsistent with an included account login.
- Cover the exact PR #186 payload shape with an intake regression test.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `event-projections`: Resolve missing webhook installation-account data through existing bindings with one approved account identity before persistence.

## Impact

- GitHub webhook intake and its tests.
- The `event-projections` contract for installation identity validation.
- No API, dependency, configuration, or deployment changes.
