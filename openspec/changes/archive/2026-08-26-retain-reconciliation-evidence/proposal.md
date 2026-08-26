## Why

Reconciliation currently overwrites the only failure detail with a generic message, so a later stale dashboard cannot identify the failed provider operation or distinguish repeated failures. Retaining a small, safe history makes future incidents diagnosable without exposing provider payloads or credentials.

## What Changes

- Record a bounded, user-scoped reconciliation evidence history for each installation, preserving both failed and successful attempts.
- Retain only sanitized diagnostic fields needed to identify the failed operation, repository scope when known, and classified provider outcome.
- Keep the dashboard's stale indicator and public error treatment generic; do not expose provider payloads, tokens, request URLs, or raw error bodies.
- Prune old evidence deterministically while preserving the existing last-success and stale-state behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `provider-reconciliation`: Retain bounded, sanitized per-installation reconciliation evidence in addition to the existing latest-success and stale/error projection.

## Impact

- Affected code: reconciliation persistence and error classification in `src/db.ts` and `src/github.ts`, plus user-scoped access and tests.
- Affected API/UI: dashboard stale behavior remains unchanged; internal evidence must remain user-scoped and non-sensitive.
- No GitHub App, Railway, MongoDB provider configuration, or dependency changes.
