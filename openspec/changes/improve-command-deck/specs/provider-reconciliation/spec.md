## MODIFIED Requirements

### Requirement: Conditional serial reconciliation
The system SHALL make reconciliation reads serially, store authenticated response ETags, preserve projections on `304`, select the authoritative latest deployment status by provider status identity and creation time rather than response position alone, honor provider rate-limit reset and retry headers, and use bounded exponential backoff for retryable failures.

#### Scenario: Reconciled resource is unchanged
- **WHEN** GitHub returns `304` to an authenticated conditional request
- **THEN** the system retains the existing projection and records a successful no-change reconciliation

#### Scenario: Deployment status response contains multiple or unordered states
- **WHEN** GitHub returns deployment status records whose response position alone does not prove recency
- **THEN** reconciliation projects the authoritative newest status and retains its provider status identity for later ordering

#### Scenario: Provider rate limit is reached
- **WHEN** a provider response supplies a retry or reset time
- **THEN** the system stops immediate retries and waits until the instructed time before its bounded retry

## ADDED Requirements

### Requirement: User-scoped immediate reconciliation
An authenticated developer SHALL be able to request immediate reconciliation for only approved installations bound to that signed-in user, using the same installation bootstrap behavior as scheduled reconciliation.

#### Scenario: User requests immediate reconciliation
- **WHEN** the signed-in user triggers reconciliation
- **THEN** the system deduplicates and serially reconciles that user's approved bound installations and no others

#### Scenario: User has no eligible installation
- **WHEN** the signed-in user has no approved bound installation
- **THEN** the request returns not found without starting provider work
