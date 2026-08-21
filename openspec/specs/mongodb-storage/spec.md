# mongodb-storage Specification

## Purpose
Defines the MongoDB ownership, isolation, lifecycle, consistency, and readiness contracts used to persist each user's active command-center projection.

## Requirements

### Requirement: User-owned aggregate
The system SHALL persist each GitHub user as one aggregate root keyed by the user's stable GitHub ID. The aggregate SHALL contain that user's identity, bound GitHub App installations and account identities, repositories visible through those installations, open pull requests authored by that user, active OpenSpec progress, and bounded recent deployment projections. The system SHALL NOT introduce shared installation, repository, or pull-request documents as the source for personal dashboard reads.

#### Scenario: Personal projection read
- **WHEN** an authenticated user requests the dashboard
- **THEN** the system reads only the aggregate keyed by that user's verified GitHub ID
- **AND** returns no projection owned by another user

#### Scenario: Multiple bound installations
- **WHEN** a user has more than one verified GitHub App installation binding
- **THEN** every binding and its authorized repository projection is represented within that user's aggregate

#### Scenario: Shared installation fan-out
- **WHEN** one installation is bound to multiple users and a provider event changes its projection
- **THEN** the system independently updates each bound user's aggregate
- **AND** does not make one user's document the shared source of truth for another user

### Requirement: Independent operational collections
The system SHALL keep hashed sessions, hashed OAuth states, global webhook inbox deliveries, provider response and ETag cache entries, and notifications outside the user aggregate. Each collection SHALL enforce the identity, expiry, uniqueness, or retry boundary required by its independent lifecycle.

#### Scenario: Session and OAuth expiry
- **WHEN** a session or OAuth state reaches its expiry time
- **THEN** the system rejects it even if asynchronous database expiry cleanup has not yet removed its document

#### Scenario: Webhook delivery deduplication
- **WHEN** the same provider and delivery ID is received more than once
- **THEN** one inbox identity controls processing and retries
- **AND** the event is not projected twice

#### Scenario: Notification transition deduplication
- **WHEN** the same user-scoped transition is recorded more than once
- **THEN** the notification uniqueness boundary admits at most one durable notification for that transition

### Requirement: Hashed authentication material
The system SHALL store only hashes of session tokens and OAuth states. GitHub OAuth user access tokens SHALL remain transient and SHALL NOT be persisted in any MongoDB document. Provider repository reads SHALL continue to use GitHub App installation tokens.

#### Scenario: Authentication document inspection
- **WHEN** persisted authentication documents are inspected
- **THEN** no raw session token, raw OAuth state, or GitHub OAuth user access token is present

#### Scenario: Provider synchronization
- **WHEN** the system reads repositories, pull requests, checks, workflows, or deployments
- **THEN** it authenticates with a token scoped to the verified GitHub App installation

### Requirement: Stable-identity projection updates
The system SHALL deduplicate embedded installations, repositories, pull requests, OpenSpec progress, and deployments by stable provider identity. A projection mutation SHALL atomically compare the aggregate revision it read with the revision it replaces and SHALL retry from current state after a concurrent change rather than silently overwriting that change.

#### Scenario: Duplicate provider event
- **WHEN** the same logical provider object is projected more than once
- **THEN** the user aggregate contains one element for its stable identity with the latest accepted state

#### Scenario: Concurrent webhook and reconciliation
- **WHEN** reconciliation attempts to replace a projection after a webhook changed the aggregate revision
- **THEN** the stale replacement is rejected
- **AND** reconciliation recomputes its update from the current aggregate

### Requirement: Complete-snapshot replacement
The system SHALL retain the last successful projection when a provider refresh is incomplete or fails. It SHALL remove stale embedded records only after the complete provider snapshot supported by the current reconciliation contract has been collected successfully.

#### Scenario: Provider page or request failure
- **WHEN** any required provider request fails before the current reconciliation snapshot is complete
- **THEN** the system leaves the previously stored user projection intact
- **AND** records sanitized diagnostic details for retry

#### Scenario: Successful reconciliation
- **WHEN** all required provider responses for an installation are collected successfully
- **THEN** the system atomically replaces that installation's projection and removes records absent from the completed snapshot

### Requirement: Bounded aggregate growth
The system SHALL retain only active personal projections in the user aggregate: currently bound installations, authorized repositories, open authored pull requests, active OpenSpec progress, and the existing bounded recent-deployment window. Notifications, provider caches, webhook payloads, and authentication history SHALL NOT accumulate inside the aggregate. The system SHALL reject an update before it can exceed a fixed safe BSON size below MongoDB's document limit and SHALL preserve the previous aggregate on rejection.

#### Scenario: Pull request closes
- **WHEN** a projected pull request is no longer open
- **THEN** the system removes it from the user's aggregate after an authoritative event or successful reconciliation

#### Scenario: Aggregate approaches size ceiling
- **WHEN** a proposed aggregate replacement exceeds the application's safe BSON size
- **THEN** the system rejects the replacement without corrupting or partially changing the stored aggregate
- **AND** emits sanitized diagnostics identifying the affected user and installation

### Requirement: MongoDB initialization and readiness
The application SHALL initialize the required MongoDB collections and indexes idempotently and SHALL report ready only after it can reach the configured database and verify the required storage initialization. Production and both Railway projects SHALL use exactly `command-center-ai-production`; every Railway deployment SHALL reject local-demo mode and apply production secret, HTTPS-origin, and trusted-origin safeguards regardless of `NODE_ENV`; local databases SHALL use the `command-center-ai-local` family; and destructive tests SHALL use isolated `command-center-ai-test-*` databases. Startup and destructive-test guards SHALL fail closed when the configured database does not match the required hosted or isolated name. Production startup SHALL NOT require a SQLite path or persistent Railway filesystem volume.

#### Scenario: Ready MongoDB store
- **WHEN** the application can connect to MongoDB using the canonical database for its environment and all required indexes are present or created successfully
- **THEN** the readiness endpoint reports ready

#### Scenario: Unavailable or invalid MongoDB store
- **WHEN** MongoDB is unreachable, required storage initialization fails, or the configured database does not match the required environment-specific name
- **THEN** the readiness endpoint reports not ready
- **AND** the application does not claim production readiness

#### Scenario: Hosted database is exact
- **WHEN** the application starts in production or in either Railway project
- **THEN** it accepts only `command-center-ai-production` as the configured MongoDB database
- **AND** it applies production configuration and origin validation
- **AND** it rejects local-demo mode

#### Scenario: Destructive test database is isolated
- **WHEN** a destructive MongoDB test is prepared
- **THEN** its database name starts with `command-center-ai-test-`
- **AND** the guard rejects every database outside that prefix

### Requirement: Narrow binding seed
The system SHALL provide an idempotent maintenance operation that accepts one stable GitHub user ID and one or more pairs of GitHub App installation ID and installation account login. It SHALL accept only the exact account logins `cubanx`, `Crisp-Inc`, and `hudson-law`, SHALL reject missing, duplicate, conflicting, or unapproved bindings, and SHALL write no provider projection or historical SQLite data. A seeded user MAY remain unavailable to dashboard access until the next verified GitHub sign-in completes the user's current identity and session.

#### Scenario: Allowlisted binding seed
- **WHEN** the maintenance operation receives a stable user ID and distinct installation bindings whose account logins are exactly allowlisted
- **THEN** it creates or confirms the corresponding aggregate bindings idempotently
- **AND** leaves repositories and provider projections for canonical bootstrap

#### Scenario: Unapproved or conflicting seed
- **WHEN** any account login is unapproved, any required identifier is missing, or an existing installation has conflicting ownership or account identity
- **THEN** the operation fails without partially modifying the aggregate

### Requirement: No general SQLite migration path
The MongoDB runtime SHALL NOT read from or write to the legacy SQLite store and SHALL NOT provide dual writes, historical-data import, or reverse migration. The binding seed SHALL be the only supported handoff into a fresh MongoDB production store.

#### Scenario: MongoDB application startup
- **WHEN** the MongoDB runtime starts
- **THEN** it does not inspect or import a SQLite database

#### Scenario: Legacy data exists
- **WHEN** repositories, pull requests, deployments, notifications, sessions, OAuth states, webhook deliveries, or cache entries exist only in SQLite
- **THEN** the system does not copy them into MongoDB
- **AND** provider-owned projections are recovered only through canonical bootstrap and reconciliation
