## ADDED Requirements

### Requirement: Verified main merge prerequisite
The rollout MUST remain blocked until PR #2 is merged and its exact merge SHA is verified on refreshed current `main` as containing the reviewed deployment change.

#### Scenario: Feature branch is not production authority
- **WHEN** PR #2 is open, unmerged, or absent from current `main`
- **THEN** no Railway source binding, deployment, restart, rollback, or production verification SHALL occur

#### Scenario: Merge prerequisite passes
- **WHEN** PR #2 is merged and its exact merge SHA is current on refreshed `main`
- **THEN** that merge SHA SHALL be recorded as the only authorized release identity

### Requirement: Evidence-gated deployment activation
The operator MUST deploy the authorized merge SHA to the existing single Railway service and MUST stop unless both `/health` and database-backed `/ready` return `200`.

#### Scenario: Deployment identity and readiness pass
- **WHEN** Railway reports the deployment for the authorized merge SHA as successful and both endpoints return `200`
- **THEN** the deployment ID, Git SHA, and endpoint statuses SHALL be recorded before application verification continues

#### Scenario: Deployment or readiness fails
- **WHEN** the deployed SHA differs, Railway reports a terminal failure, or either endpoint is non-`200`
- **THEN** verification SHALL stop and no success evidence SHALL be claimed

### Requirement: Bounded application verification
The rollout MUST verify one OAuth login, one secure session, one selected-repository bootstrap, accepted signed GitHub deliveries for each configured event family, installation-scoped deployment projection, and deduplicated terminal notifications.

#### Scenario: Selected-repository verification
- **WHEN** the installed App bootstraps `cubanx/dev-command-center` and signed events are delivered
- **THEN** the dashboard SHALL show only installation-scoped data and terminal notifications SHALL occur only once per transition

#### Scenario: Trust boundary violation
- **WHEN** a signature is invalid, a repository is outside the installation, or a duplicate delivery is received
- **THEN** the system SHALL reject or deduplicate it without widening visible data

### Requirement: Persistent restart and reversible rollback
The operator MUST verify inbox and projection persistence across one service restart and MUST rehearse or execute rollback without replacing the attached volume, then restore the intended merge SHA.

#### Scenario: Restart preserves state
- **WHEN** the service restarts with the same `/data` volume
- **THEN** prior delivery identifiers and projections SHALL remain queryable and `/ready` SHALL recover to `200`

#### Scenario: Rollback preserves storage
- **WHEN** the operator selects the last known-good application deployment and later restores the intended merge SHA
- **THEN** the same volume SHALL remain attached and readiness outcomes for both transitions SHALL be recorded

### Requirement: Redacted completion evidence
The change MUST remain incomplete until evidence records the timestamp, exact merge SHA, Railway deployment ID, configuration-name checklist, endpoint statuses, GitHub delivery IDs, OAuth and projection outcomes, restart persistence, and rollback result without secret values or payloads.

#### Scenario: Evidence is complete and safe
- **WHEN** every operational gate has passed
- **THEN** the evidence record SHALL contain all required identifiers and outcomes and SHALL contain no credentials, resolved secrets, tokens, cookies, or webhook payloads
