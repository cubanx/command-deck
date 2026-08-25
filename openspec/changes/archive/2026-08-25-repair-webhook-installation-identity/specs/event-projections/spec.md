## MODIFIED Requirements

### Requirement: Durable idempotent GitHub intake
The system SHALL verify the raw GitHub request body with a timing-safe SHA-256 HMAC comparison, enforce a body-size limit, and confirm before persistence that the payload identifies either an approved installation account of `cubanx`, `Crisp-Inc`, or `hudson-law` or an installation ID whose existing approved bindings resolve to exactly one normalized account identity. When the payload includes both an installation ID and account login, they SHALL be consistent with any existing binding. It SHALL persist an accepted delivery before responding and deduplicate it by `X-GitHub-Delivery`.

#### Scenario: Valid new GitHub delivery
- **WHEN** a supported request has a valid signature, unused delivery identifier, and an approved installation account login
- **THEN** the system durably queues it and returns `202` before projection processing

#### Scenario: Missing account resolved from installation binding
- **WHEN** a supported correctly signed payload has an installation ID, no installation account login, and one or more existing approved bindings that resolve to exactly one normalized account identity
- **THEN** the system durably queues it with the bound account identity and returns `202` before projection processing

#### Scenario: Redelivered GitHub event
- **WHEN** a valid approved-account request reuses an already persisted delivery identifier
- **THEN** the system acknowledges it without applying projections or notifications twice

#### Scenario: Invalid GitHub signature
- **WHEN** signature validation fails
- **THEN** the system rejects the request without parsing or persisting the payload

#### Scenario: Installation account is missing or unapproved
- **WHEN** a correctly signed payload identifies an account outside the exact allowlist, has no approved account or existing approved installation binding, resolves to multiple approved account identities, or conflicts with an existing binding
- **THEN** the system ignores it without persisting the payload or triggering projection processing
