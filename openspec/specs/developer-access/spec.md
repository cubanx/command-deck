# developer-access Specification

## Purpose
TBD - created by archiving change build-developer-command-center-mvp. Update Purpose after archive.

## Requirements

### Requirement: GitHub-authenticated developer sessions
The system SHALL authenticate developers through a state-bound GitHub OAuth callback, SHALL persist only a hash of each opaque session token, and SHALL deliver the token in a HTTP-only same-site cookie. The cookie MUST include `Secure` except for an explicit non-production loopback HTTP development origin.

#### Scenario: Successful sign-in
- **WHEN** GitHub returns a valid authorization code and matching state
- **THEN** the system upserts the developer identity, creates a hashed session, and redirects to the command center without persisting the GitHub user access token

#### Scenario: Invalid callback state
- **WHEN** a callback omits or changes the state value
- **THEN** the system rejects the callback without creating a user or session

#### Scenario: Local non-demo sign-in uses a loopback callback
- **WHEN** non-production development configures an explicit loopback HTTP public origin and GitHub returns a valid authorization code and matching state
- **THEN** the authorization request and callback use that origin, and the session cookie is HTTP-only and same-site without `Secure`

#### Scenario: Hosted and unsafe origins reject non-secure sessions
- **WHEN** production configures its public origin or non-production configures a malformed or non-loopback HTTP public origin
- **THEN** startup rejects the configuration and the system does not issue a non-secure session cookie

### Requirement: Installation-bound access
The system SHALL bind GitHub App installation identifiers to authenticated developers only when GitHub identifies the installation account as `cubanx`, `Crisp-Inc`, or `hudson-law`, and SHALL scope repository-derived data through every approved installation bound to the signed-in developer. This exact account-login allowlist MUST be checked independently of organization membership. The system MUST deduplicate repeated projections only by a stable GitHub pull-request identity after applying account, user, installation, repository, and author authorization.

#### Scenario: Developer binds an installation
- **WHEN** a signed-in developer returns from the GitHub App setup flow with an installation identifier and approved account login found on any page of that developer's authorized installation list
- **THEN** the installation and verified account login are durably associated with that developer without granting access to unrelated installations, and canonical bootstrap is scheduled before the callback redirects

#### Scenario: Immediate bootstrap fails after binding
- **WHEN** canonical bootstrap fails after an approved installation is durably bound
- **THEN** the binding remains available for scheduled reconciliation recovery and the failure is recorded through sanitized diagnostics

#### Scenario: Developer selects an unapproved or unidentified installation account
- **WHEN** GitHub identifies the requested installation with an account login outside the exact allowlist or supplies no account login
- **THEN** the system creates no installation binding and stores no repository-derived metadata for that installation

#### Scenario: Developer has multiple bound installations
- **WHEN** a signed-in developer requests dashboard data and has multiple GitHub App installations bound to their identity
- **THEN** authored open pull requests from every bound installation are included while repositories outside those installations are excluded

#### Scenario: Another developer has a matching login or installation data exists without a binding
- **WHEN** dashboard projections are selected for the signed-in developer
- **THEN** account or author login matching does not bypass the signed-in developer's approved installation bindings and no other developer's installation-only data is returned

#### Scenario: Legacy installation account is missing or unapproved
- **WHEN** a stored installation has no verified approved account login
- **THEN** its existing metadata remains intact but inert and invisible until authoritative verification backfills an approved account login

#### Scenario: Authorized snapshots repeat one pull request
- **WHEN** two bound installation snapshots contain the same stable GitHub pull-request identity
- **THEN** the signed-in developer receives one newest authorized projection for that pull request

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
