## MODIFIED Requirements

### Requirement: Installation-bound access
The system SHALL bind GitHub App installation identifiers to authenticated developers only when GitHub identifies the installation account as `cubanx`, `Crisp-Inc`, or `hudson-law`, and SHALL scope repository-derived data through every approved installation bound to the signed-in developer. This exact account-login allowlist MUST be checked independently of organization membership. The system MUST deduplicate repeated projections only by a stable GitHub pull-request identity after applying account, user, installation, and repository authorization; author selection remains a dashboard filter.

#### Scenario: Developer binds an installation
- **WHEN** a signed-in developer returns from the GitHub App setup flow with an installation identifier and approved account login found on any page of that developer's authorized installation list
- **THEN** a separate user-installation binding and shared installation with verified account login are durably established for that developer without granting access to unrelated installations, and canonical bootstrap is scheduled before the callback redirects

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

#### Scenario: Shared repository access
- **WHEN** a user has a verified active installation binding
- **THEN** server-side reads allow repositories exposed by that installation, and UI preferences cannot extend that set

#### Scenario: Binding removed
- **WHEN** a user loses a binding
- **THEN** subsequent reads and live refresh access exclude its repositories unless another valid binding grants access, without deleting shared provider data

### Requirement: Cross-user isolation
The system MUST filter every developer-facing read and live stream by the authenticated developer's identifier and installation bindings.

#### Scenario: Two developers have different installations
- **WHEN** one developer requests the dashboard or event stream
- **THEN** no rows or live events available only through the other developer's bindings are returned
