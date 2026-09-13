## MODIFIED Requirements

### Requirement: Conditional serial reconciliation
The system SHALL make reconciliation reads serially, store authenticated response ETags with their corresponding domain data, scoped to endpoint, request parameters, page, and installation authorization, preserve projections on `304`, select the authoritative latest deployment status by provider status identity and creation time rather than response position alone, honor provider rate-limit reset and retry headers, and use bounded exponential backoff for retryable failures.

#### Scenario: Reconciled resource is unchanged
- **WHEN** GitHub returns `304` to an authenticated conditional request
- **THEN** the system retains the existing projection and records a successful no-change reconciliation

#### Scenario: Deployment status response contains multiple or unordered states
- **WHEN** GitHub returns deployment status records whose response position alone does not prove recency
- **THEN** reconciliation projects the authoritative newest status and retains its provider status identity for later ordering

#### Scenario: Provider rate limit is reached
- **WHEN** a provider response supplies a retry or reset time
- **THEN** the system stops immediate retries and waits until the instructed time before its bounded retry

#### Scenario: Later page fails
- **WHEN** any repository or open-pull-request page fails after bounded retries
- **THEN** the system preserves the complete prior projection, removes no rows from the incomplete result, and exposes stale/error state

#### Scenario: Mixed changed and unchanged pages
- **WHEN** a paginated refresh receives both 200 and 304 responses
- **THEN** it reconstructs the complete result and continuation sequence from matching retained page evidence, or avoids conditional requests when that evidence is unavailable
- **AND** an ETag is never saved without the corresponding usable data

### Requirement: Visible reconciliation failure
The system SHALL preserve last-known evidence and expose stale/error state on refresh failure. One shared document per reconciliation run SHALL contain scope, start/finish times, status, bounded progress/counts, and sanitized failures, without provider payloads, request URLs, headers, tokens, raw bodies, or stack traces. Evidence SHALL be visible only through authorized installation bindings. Completed run documents SHALL expire after 72 hours; unfinished runs SHALL remain available for recovery.

#### Scenario: Repair request fails
- **WHEN** a provider read fails
- **THEN** prior evidence remains visibly stale with a sanitized run failure.

#### Scenario: Paginated repair is incomplete
- **WHEN** a later page fails
- **THEN** the partial listing cannot authorize removal.

#### Scenario: Reconciliation succeeds after a failure
- **WHEN** a subsequent run succeeds
- **THEN** current freshness clears while retained run history remains.

#### Scenario: Another user cannot access installation evidence
- **WHEN** a user lacks a binding to the run scope
- **THEN** the run is not returned.

#### Scenario: Completed run retention
- **WHEN** a completed run is 72 hours old
- **THEN** it is eligible for expiry without deleting domain data.

#### Scenario: Repeated reconciliation attempts exceed retention
- **WHEN** an installation completes more than 20 runs within the retention window
- **THEN** each run retains its independent bounded evidence until time-based expiry, without accumulating an evidence array inside a user or installation document

## ADDED Requirements

### Requirement: Clean-store reconstruction
Canonical reconciliation SHALL rebuild authorized repositories, open PRs, recent deployments, and merged PRs with incomplete post-merge OpenSpec obligations from GitHub without legacy stored state. It SHALL establish exact PR ownership and source provenance before exposing OpenSpec evidence, and SHALL expose incomplete discovery as stale/error rather than claiming a complete dashboard.

#### Scenario: Fresh connection
- **WHEN** a user connects an approved installation in an empty store
- **THEN** reconciliation discovers the agreed dashboard state using installation tokens.

#### Scenario: Older merged work remains incomplete
- **WHEN** a merged PR outside the recent deployment window has a still-active post-merge obligation
- **THEN** reconstruction can recover it from committed evidence and verified PR correlation rather than silently dropping it at a recent-PR cutoff.
