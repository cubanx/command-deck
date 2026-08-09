## ADDED Requirements

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

### Requirement: Safe credential-free local demo
The system SHALL make the standard development command serve deterministic fixture projections as one fictional developer without provider credentials, cookies, or a separate dashboard implementation, and MUST reject that access mode when production is declared.

#### Scenario: Developer starts the local command center
- **WHEN** the standard development command starts without GitHub or Railway credentials
- **THEN** the loopback-only service seeds representative user-scoped projections idempotently and its snapshot and live stream authenticate as the fixture developer

#### Scenario: Local demo is requested in production
- **WHEN** configuration enables the local demo while declaring a production environment
- **THEN** startup fails before serving requests
