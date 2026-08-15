## MODIFIED Requirements

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
