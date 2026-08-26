# provider-reconciliation Specification

## Purpose
TBD - created by archiving change build-developer-command-center-mvp. Update Purpose after archive.

## Requirements

### Requirement: Installation-token provider reads
The system SHALL use GitHub App installation access tokens for repository automation reads, SHALL authoritatively verify that the installation account is `cubanx`, `Crisp-Inc`, or `hudson-law` before repository or deployment reads and projection mutation, SHALL retrieve every page of repositories and open pull requests available to the approved installation, and MUST NOT use a developer's GitHub user token for projection bootstrap or reconciliation.

#### Scenario: Bootstrap reads repository state
- **WHEN** a developer explicitly requests bootstrap for a bound installation whose account is approved
- **THEN** the system verifies and stores its authoritative account login before every page of GitHub repository and open-pull-request reads uses a freshly minted token for that installation

#### Scenario: Verified OAuth binding completes
- **WHEN** an approved installation is durably bound through the verified OAuth callback
- **THEN** the system schedules the same canonical installation-token bootstrap path directly and returns the callback redirect without waiting for provider pagination

#### Scenario: Callback-triggered bootstrap fails
- **WHEN** token creation or canonical bootstrap fails after callback binding
- **THEN** the system logs a sanitized failure, preserves the binding and existing projections, and allows scheduled reconciliation to retry normally

#### Scenario: Installation account is missing locally
- **WHEN** a legacy installation has no stored account login and GitHub authoritatively identifies it as an approved account
- **THEN** the system backfills the account login and may continue bootstrap without deleting prior metadata

#### Scenario: Installation account is unapproved
- **WHEN** a stored or authoritative installation account login is outside the exact allowlist or missing from the authoritative response
- **THEN** bootstrap and reconciliation perform no repository or deployment list reads, mutate no projections, and retain prior metadata as inert

#### Scenario: Installation exceeds one provider page
- **WHEN** an installation has more repositories or a repository has more open pull requests than one provider page contains
- **THEN** bootstrap and scheduled reconciliation project all authorized pages without silently truncating the installation

### Requirement: Narrow provider read paths
The system SHALL reserve provider reads for explicit bootstrap, targeted repair, explicit detail views, changed committed OpenSpec artifacts, and infrequent reconciliation.

#### Scenario: Normal webhook update
- **WHEN** a supported webhook contains enough state to update a projection
- **THEN** the system updates local state without performing a list or search request

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

#### Scenario: Later page fails
- **WHEN** any repository or open-pull-request page fails after bounded retries
- **THEN** the system preserves the complete prior projection, removes no rows from the incomplete result, and exposes stale/error state

### Requirement: Visible reconciliation failure
The system MUST preserve the last known evidence and expose stale/error state when reconciliation fails, including failure on any page of a paginated resource, rather than marking the resource verified or current. For each installation, it SHALL retain at most 20 user-scoped, sanitized reconciliation evidence records ordered by completion time. Each record MUST identify the completion time, success or failure outcome, operation category, and, when known, repository identity and provider status code; it MUST NOT retain provider payloads, request URLs, headers, tokens, raw error bodies, or stack traces.

#### Scenario: Repair request fails
- **WHEN** an authoritative provider read fails after bounded retries
- **THEN** the existing projection remains available with an explicit stale/error indicator and a sanitized failure evidence record is retained

#### Scenario: Paginated repair is incomplete
- **WHEN** an authoritative provider read obtains some pages but fails before reaching the final page
- **THEN** none of the partial result is applied as a complete snapshot, the prior projection remains available with an explicit stale/error indicator, and a sanitized failure evidence record is retained

#### Scenario: Repeated reconciliation attempts exceed retention
- **WHEN** an installation completes more than 20 reconciliation attempts
- **THEN** the system retains the 20 most recent evidence records and deterministically removes older records

#### Scenario: Reconciliation succeeds after a failure
- **WHEN** a previously stale installation reconciles successfully
- **THEN** the system clears its stale/error state and retains a successful evidence record without deleting earlier retained evidence

#### Scenario: Another user cannot access installation evidence
- **WHEN** an authenticated user does not own an installation's reconciliation projection
- **THEN** that user cannot receive its reconciliation evidence

### Requirement: User-scoped immediate reconciliation
An authenticated developer SHALL be able to request immediate reconciliation for only approved installations bound to that signed-in user, using the same installation bootstrap behavior as scheduled reconciliation.

#### Scenario: User requests immediate reconciliation
- **WHEN** the signed-in user triggers reconciliation
- **THEN** the system deduplicates and serially reconciles that user's approved bound installations and no others

#### Scenario: User has no eligible installation
- **WHEN** the signed-in user has no approved bound installation
- **THEN** the request returns not found without starting provider work

### Requirement: Bounded provider request execution
The system SHALL apply one fixed upper bound to every server-side GitHub request. On timeout, it SHALL expose a sanitized diagnostic identifying the request method and URL, preserve prior projections with visible stale/error state, and release reconciliation serialization so a later attempt can run.

#### Scenario: Provider request times out
- **WHEN** a server-side GitHub request exceeds the fixed upper bound
- **THEN** the request fails with a sanitized method and URL diagnostic, and existing projections remain available as stale/error state

#### Scenario: Reconciliation recovers after timeout
- **WHEN** a serialized reconciliation fails because a GitHub request times out
- **THEN** a subsequent reconciliation attempt is accepted and can complete using the existing retry behavior
