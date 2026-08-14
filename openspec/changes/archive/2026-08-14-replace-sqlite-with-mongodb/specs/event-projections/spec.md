## MODIFIED Requirements

### Requirement: Incremental GitHub projections
The system SHALL revalidate the exact installation-account allowlist before updating affected local pull-request, review, check, workflow, installation, repository, deployment, and deployment-status projections from supported signed GitHub webhook event/action pairs. It SHALL ignore unknown pairs safely and MUST NOT fetch provider data, write metadata, or notify users for a missing or unapproved installation account.

#### Scenario: Pull request state changes
- **WHEN** a supported pull-request webhook from an approved installation account changes a tracked pull request
- **THEN** the installation-scoped projection is inserted, updated, or removed without listing all pull requests from GitHub

#### Scenario: Deployment status changes
- **WHEN** a signed `deployment` or `deployment_status` delivery from an approved installation account changes a deployment in a selected repository
- **THEN** the installation-scoped GitHub deployment projection is inserted or updated idempotently without a Railway API read

#### Scenario: Retained delivery has an unapproved installation account
- **WHEN** a legacy or directly queued delivery is processed with a missing or unapproved installation account login
- **THEN** it produces no installation, repository, pull-request, deployment, OpenSpec, or notification mutation and performs no provider fetch

## REMOVED Requirements

### Requirement: Verified Railway projections
The system MUST treat Railway webhook payloads as untrusted hints, SHALL validate their minimum shape, and SHALL reconcile the referenced deployment through the Railway Public API before persisting an authoritative status or emitting a transition notification.

#### Scenario: Authoritative Railway deployment matches the hint
- **WHEN** a shape-valid hint references a deployment returned for the stated project and service
- **THEN** the system records the API status as verified and may emit a useful transition

#### Scenario: Railway hint cannot be verified
- **WHEN** the provider API does not return the referenced deployment or is unavailable
- **THEN** the system retains a deployment projection with pending/error verification state for dashboard evidence and emits no success or failure notification

## ADDED Requirements

### Requirement: GitHub-native deployment projections
The system MUST derive deployment visibility from signed GitHub `deployment` and `deployment_status` events and bounded installation-token bootstrap or repair reads, and MUST NOT require Railway runtime credentials or webhook hints.

#### Scenario: Signed deployment delivery
- **WHEN** a valid GitHub deployment delivery identifies an installation, repository, deployment, ref, SHA, and environment
- **THEN** the system stores that GitHub identity and metadata within the installation boundary

#### Scenario: Signed deployment status delivery
- **WHEN** a valid status delivery identifies a known deployment and status
- **THEN** the system updates its state, target or log URL, and timestamp and may emit only a useful terminal transition

#### Scenario: Bootstrap or explicit repair
- **WHEN** a selected repository is bootstrapped or explicitly repaired
- **THEN** the system performs bounded conditional installation-token reads for deployments and their latest statuses while honoring backoff and rate-limit metadata
