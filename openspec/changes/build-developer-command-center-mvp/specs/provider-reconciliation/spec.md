## ADDED Requirements

### Requirement: Installation-token provider reads
The system SHALL use GitHub App installation access tokens for repository automation reads and MUST NOT use a developer's GitHub user token for projection bootstrap or reconciliation.

#### Scenario: Bootstrap reads repository state
- **WHEN** a developer explicitly requests bootstrap for a bound installation
- **THEN** all GitHub repository reads use a freshly minted installation access token

### Requirement: Narrow provider read paths
The system SHALL reserve provider reads for explicit bootstrap, targeted repair, explicit detail views, changed committed OpenSpec artifacts, and infrequent reconciliation.

#### Scenario: Normal webhook update
- **WHEN** a supported webhook contains enough state to update a projection
- **THEN** the system updates local state without performing a list or search request

### Requirement: Conditional serial reconciliation
The system SHALL make reconciliation reads serially, store authenticated response ETags, preserve projections on `304`, honor provider rate-limit reset and retry headers, and use bounded exponential backoff for retryable failures.

#### Scenario: Reconciled resource is unchanged
- **WHEN** GitHub returns `304` to an authenticated conditional request
- **THEN** the system retains the existing projection and records a successful no-change reconciliation

#### Scenario: Provider rate limit is reached
- **WHEN** a provider response supplies a retry or reset time
- **THEN** the system stops immediate retries and waits until the instructed time before its bounded retry

### Requirement: Visible reconciliation failure
The system MUST preserve the last known evidence and expose stale/error state when reconciliation fails rather than marking the resource verified or current.

#### Scenario: Repair request fails
- **WHEN** an authoritative provider read fails after bounded retries
- **THEN** the existing projection remains available with an explicit stale/error indicator
