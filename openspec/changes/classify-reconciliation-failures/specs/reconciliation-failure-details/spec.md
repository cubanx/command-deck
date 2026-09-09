## Purpose

Preserve useful reconciliation failure identity without exposing exception payloads or infrastructure addresses in application logs.

## ADDED Requirements

### Requirement: Safe failure details

Reconciliation persistence and webhook drain failures SHALL emit a finite failure classification, an optional validated nonnegative 32-bit integer error code, and an optional integer HTTP status from 100 through 599. Targeted failures SHALL identify the numeric repository and positive safe-integer PR number when valid. The system MUST NOT emit raw exception messages, names, stacks, causes, arbitrary diagnostics, credentials, or database addresses. Unrecognized or unreadable exceptions SHALL remain observable as unknown failures. Stage wrappers SHALL preserve these safe details. Retry limits, serialization, failure outcomes, and existing duplicate ownership SHALL remain unchanged.

#### Scenario: Known persistence failure

- **WHEN** persistence reports aggregate contention, missing aggregate, aggregate size limit, or a recognized driver network/timeout/server/serialization failure
- **THEN** the diagnostic carries the corresponding finite classification, safe code/status when available, and validated PR target

#### Scenario: Hostile exception

- **WHEN** a thrown value contains sensitive payloads, invalid numeric fields, getters that throw, or an unrecognized name
- **THEN** one parseable sanitized diagnostic is emitted without leaking payloads or suppressing the real failure

#### Scenario: Drain failure and recovery

- **WHEN** a webhook drain fails and a later drain succeeds
- **THEN** the failure has a sanitized diagnostic and the existing drain queue continues normally

#### Scenario: Stage propagation and duplicate ownership

- **WHEN** a targeted stage fails or an inner reporter already reports a persistence failure
- **THEN** safe classification, code, status, and target reach the owning log boundary without adding a duplicate for the same failed operation
