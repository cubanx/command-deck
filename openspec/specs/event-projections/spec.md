# event-projections Specification

## Purpose
TBD - created by archiving change build-developer-command-center-mvp. Update Purpose after archive.
## Requirements
### Requirement: Durable idempotent GitHub intake
The system SHALL verify the raw GitHub request body with a timing-safe SHA-256 HMAC comparison, enforce a body-size limit, and confirm that the payload identifies an installation account of `cubanx`, `Crisp-Inc`, or `hudson-law` before persisting it. It SHALL persist an accepted delivery before responding and deduplicate it by `X-GitHub-Delivery`.

#### Scenario: Valid new GitHub delivery
- **WHEN** a supported request has a valid signature, unused delivery identifier, and approved installation account login
- **THEN** the system durably queues it and returns `202` before projection processing

#### Scenario: Redelivered GitHub event
- **WHEN** a valid approved-account request reuses an already persisted delivery identifier
- **THEN** the system acknowledges it without applying projections or notifications twice

#### Scenario: Invalid GitHub signature
- **WHEN** signature validation fails
- **THEN** the system rejects the request without parsing or persisting the payload

#### Scenario: Installation account is missing or unapproved
- **WHEN** a correctly signed payload has no installation account login or identifies an account outside the exact allowlist
- **THEN** the system ignores it without persisting the payload or triggering projection processing

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

### Requirement: Configurable automated review evidence
The system SHALL optionally project automated review progress from signed pull-request comment webhooks using an exact configured bot login and configurable started and finished markers, independently of the formal GitHub review decision.

#### Scenario: Configured reviewer starts work
- **WHEN** a created or edited pull-request comment is authored by the configured bot and contains the configured started marker
- **THEN** the pull request records the automated review as in progress without changing its formal review state

#### Scenario: Configured reviewer finishes work
- **WHEN** a created or edited pull-request comment is authored by the configured bot and contains the configured finished marker
- **THEN** the pull request records the automated review as complete, with completion taking precedence if both markers are present

#### Scenario: Comment evidence is not authoritative
- **WHEN** the actor does not match, the comment is not on a pull request, or the signal configuration is incomplete
- **THEN** the automated review projection remains unchanged

### Requirement: Verified Railway projections
The system MUST treat Railway webhook payloads as untrusted hints, SHALL validate their minimum shape, and SHALL reconcile the referenced deployment through the Railway Public API before persisting an authoritative status or emitting a transition notification.

#### Scenario: Authoritative Railway deployment matches the hint
- **WHEN** a shape-valid hint references a deployment returned for the stated project and service
- **THEN** the system records the API status as verified and may emit a useful transition

#### Scenario: Railway hint cannot be verified
- **WHEN** the provider API does not return the referenced deployment or is unavailable
- **THEN** the system retains a deployment projection with pending/error verification state for dashboard evidence and emits no success or failure notification

### Requirement: Recoverable inbox processing
The system SHALL retry pending accepted deliveries after process startup and SHALL clear raw payload bodies after successful processing while retaining delivery identity and outcome.

#### Scenario: Process stops after acknowledgement
- **WHEN** the service restarts with a pending accepted delivery
- **THEN** the worker resumes it without requiring provider redelivery
