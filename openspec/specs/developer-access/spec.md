# developer-access Specification

## Purpose
TBD - created by archiving change build-developer-command-center-mvp. Update Purpose after archive.
## Requirements
### Requirement: GitHub-authenticated developer sessions
The system SHALL authenticate developers through a state-bound GitHub OAuth callback, SHALL persist only a hash of each opaque session token, and SHALL deliver the token in a secure HTTP-only same-site cookie.

#### Scenario: Successful sign-in
- **WHEN** GitHub returns a valid authorization code and matching state
- **THEN** the system upserts the developer identity, creates a hashed session, and redirects to the command center without persisting the GitHub user access token

#### Scenario: Invalid callback state
- **WHEN** a callback omits or changes the state value
- **THEN** the system rejects the callback without creating a user or session

### Requirement: Installation-bound access
The system SHALL bind GitHub App installation identifiers to authenticated developers and SHALL scope repository-derived data through those bindings.

#### Scenario: Developer binds an installation
- **WHEN** a signed-in developer returns from the GitHub App setup flow with an installation identifier
- **THEN** the installation is associated with that developer without granting access to unrelated installations

### Requirement: Cross-user isolation
The system MUST filter every developer-facing read and live stream by the authenticated developer's identifier and installation bindings.

#### Scenario: Two developers have different installations
- **WHEN** one developer requests the dashboard or event stream
- **THEN** no rows or notifications belonging only to the other developer are returned

### Requirement: Operator-controlled Railway binding
The system MUST NOT let browser clients create Railway project, service, or environment mappings and SHALL treat a strictly validated server-side configuration keyed by immutable GitHub numeric user ID as the complete hosted mapping source for the MVP.

#### Scenario: Signed-in developer submits Railway identifiers
- **WHEN** a signed-in developer posts syntactically valid Railway resource identifiers
- **THEN** the service exposes no self-service binding route and persists no mapping

#### Scenario: Configured developer exists
- **WHEN** startup or successful GitHub login finds a configured immutable GitHub user ID already persisted as a developer
- **THEN** the service atomically replaces hosted mappings with exactly that operator-controlled configuration

#### Scenario: Configured developer has not signed in
- **WHEN** a configured immutable GitHub user ID has no persisted developer
- **THEN** the service creates no mapping until that GitHub identity signs in

#### Scenario: Local demo seeds Railway evidence
- **WHEN** the loopback-only local demo starts
- **THEN** it MAY create its deterministic fixture mapping without enabling client-created or hosted configured mappings

### Requirement: Safe credential-free local demo
The system SHALL make the standard development command serve deterministic fixture projections as one fictional developer without provider credentials, cookies, or a separate dashboard implementation, and MUST reject that access mode when production is declared.

#### Scenario: Developer starts the local command center
- **WHEN** the standard development command starts without GitHub or Railway credentials
- **THEN** the loopback-only service seeds representative user-scoped projections idempotently and its snapshot and live stream authenticate as the fixture developer

#### Scenario: Local demo is requested in production
- **WHEN** configuration enables the local demo while declaring a production environment
- **THEN** startup fails before serving requests
