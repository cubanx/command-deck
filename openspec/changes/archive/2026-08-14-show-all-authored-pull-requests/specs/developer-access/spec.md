## MODIFIED Requirements

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
