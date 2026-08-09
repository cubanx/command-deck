## ADDED Requirements

### Requirement: Durable idempotent GitHub intake
The system SHALL verify the raw GitHub request body with a timing-safe SHA-256 HMAC comparison, enforce a body-size limit, persist an accepted delivery before responding, and deduplicate it by `X-GitHub-Delivery`.

#### Scenario: Valid new GitHub delivery
- **WHEN** a supported request has a valid signature and unused delivery identifier
- **THEN** the system durably queues it and returns `202` before projection processing

#### Scenario: Redelivered GitHub event
- **WHEN** a valid request reuses an already persisted delivery identifier
- **THEN** the system acknowledges it without applying projections or notifications twice

#### Scenario: Invalid GitHub signature
- **WHEN** signature validation fails
- **THEN** the system rejects the request without parsing or persisting the payload

### Requirement: Incremental GitHub projections
The system SHALL update affected local pull-request, review, check, workflow, installation, and repository projections from supported GitHub webhook event/action pairs and SHALL ignore unknown pairs safely.

#### Scenario: Pull request state changes
- **WHEN** a supported pull-request webhook changes a tracked pull request
- **THEN** the installation-scoped projection is inserted, updated, or removed without listing all pull requests from GitHub

### Requirement: Verified Railway projections
The system MUST treat Railway webhook payloads as untrusted hints, SHALL validate their minimum shape, and SHALL reconcile the referenced deployment through the Railway Public API before persisting an authoritative status or emitting a transition notification.

#### Scenario: Authoritative Railway deployment matches the hint
- **WHEN** a shape-valid hint references a deployment returned for the stated project and service
- **THEN** the system records the API status as verified and may emit a useful transition

#### Scenario: Railway hint cannot be verified
- **WHEN** the provider API does not return the referenced deployment or is unavailable
- **THEN** the system retains a pending/error verification state and emits no success or failure notification

### Requirement: Recoverable inbox processing
The system SHALL retry pending accepted deliveries after process startup and SHALL clear raw payload bodies after successful processing while retaining delivery identity and outcome.

#### Scenario: Process stops after acknowledgement
- **WHEN** the service restarts with a pending accepted delivery
- **THEN** the worker resumes it without requiring provider redelivery
