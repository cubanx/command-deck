# event-projections Specification

## Purpose
TBD - created by archiving change build-developer-command-center-mvp. Update Purpose after archive.

## Requirements

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

### Requirement: Incremental GitHub projections
The system SHALL update affected local pull-request, review, check, workflow, installation, repository, deployment, and deployment-status projections from supported GitHub webhook event/action pairs, SHALL keep the `workflow_run` Actions aggregate distinct from the `check_run`/`check_suite` Checks aggregate, SHALL retain authoritative failed-workflow identity, name, and safe GitHub run URL without inventing detail from scalar conclusions, SHALL order deployment statuses by authoritative status identity and creation time, SHALL reject stale updates without replacing newer terminal state, and SHALL ignore unknown pairs safely.

#### Scenario: Pull request state changes
- **WHEN** a supported pull-request webhook changes a tracked pull request
- **THEN** the installation-scoped projection is inserted, updated, or removed without listing all pull requests from GitHub

#### Scenario: Deployment status changes
- **WHEN** a signed `deployment` or `deployment_status` delivery from an approved installation account changes a deployment in a selected repository
- **THEN** the installation-scoped GitHub deployment projection is inserted or updated idempotently without a Railway API read

#### Scenario: Retained delivery has an unapproved installation account
- **WHEN** a legacy or directly queued delivery is processed with a missing or unapproved installation account login
- **THEN** it produces no installation, repository, pull-request, deployment, OpenSpec, or notification mutation and performs no provider fetch

#### Scenario: Actions workflow fails
- **WHEN** a supported signed `workflow_run` event reports a failed workflow with authoritative identity, name, and GitHub run URL
- **THEN** the pull-request projection retains that failure detail for a linked dashboard action without changing the Checks aggregate

#### Scenario: Actions workflow failure changes
- **WHEN** a later supported event changes or clears a projected workflow failure
- **THEN** that workflow's retained failure detail is replaced or removed without synthesizing job or step detail

#### Scenario: Checks change independently
- **WHEN** a supported `check_run` or `check_suite` event changes the Checks aggregate
- **THEN** the projection updates Checks without overwriting the Actions aggregate or its failed-workflow links

#### Scenario: Deployment status delivery is stale
- **WHEN** a deployment-status delivery is older than or ordered before the currently projected status for that deployment
- **THEN** the projection retains the current status and records no cosmetic replacement

#### Scenario: Deployment reaches a terminal state
- **WHEN** a newer authoritative deployment status is successful, failed, inactive, or errored
- **THEN** a later-delivered stale pending or in-progress status cannot replace that terminal state

### Requirement: Configurable automated review evidence
The system SHALL optionally project automated review progress from signed pull-request comment webhooks using an exact configured bot login and configurable started and finished markers, independently of the formal GitHub review decision.

#### Scenario: Configured reviewer starts work
- **WHEN** a created or edited pull-request comment is authored by the configured bot and contains the configured started marker
- **THEN** the pull request records the automated review as in progress without changing its formal review state

#### Scenario: Configured reviewer finishes work
- **WHEN** a created or edited pull-request comment is authored by the configured bot and contains the configured finished marker
- **THEN** the pull request records the automated review as complete, with completion taking precedence if both markers are present

#### Scenario: Comment evidence is not authoritative
- **WHEN** the actor does not match, the comment is not on a pull request, or the signal configuration is incomplete
- **THEN** the automated review projection remains unchanged

### Requirement: Recoverable inbox processing
The system SHALL retry pending accepted deliveries after process startup and SHALL clear raw payload bodies after successful processing while retaining delivery identity and outcome.

#### Scenario: Process stops after acknowledgement
- **WHEN** the service restarts with a pending accepted delivery
- **THEN** the worker resumes it without requiring provider redelivery

### Requirement: GitHub-native deployment projections
The system MUST derive deployment visibility from signed GitHub `deployment` and `deployment_status` events and bounded installation-token bootstrap or repair reads, and MUST NOT require Railway runtime credentials or webhook hints.

#### Scenario: Signed deployment delivery
- **WHEN** a valid GitHub deployment delivery identifies an installation, repository, deployment, ref, SHA, and environment
- **THEN** the system stores that GitHub identity and metadata within the installation boundary

#### Scenario: Signed deployment status delivery
- **WHEN** a valid status delivery identifies a known deployment and status
- **THEN** the system updates its state, target or log URL, and timestamp and may emit only a useful terminal transition

#### Scenario: Bootstrap or explicit repair
- **WHEN** a selected repository is bootstrapped or explicitly repaired
- **THEN** the system performs bounded conditional installation-token reads for deployments and their latest statuses while honoring backoff and rate-limit metadata

### Requirement: Evidence-backed final-SHA task absence

The system SHALL read pushed OpenSpec task content from the webhook's final commit SHA. A missing task path SHALL be treated as an expected stale artifact only when a bounded GitHub read positively proves that the exact path is absent from a complete final-SHA tree; that outcome MUST preserve prior task evidence and MUST NOT synthesize a deletion. An ambiguous `404`, incomplete absence evidence, or any other provider failure SHALL remain a sanitized projection error subject to durable inbox retry.

#### Scenario: Intermediate task path is absent from the final tree

- **WHEN** a push reports a non-removed task path that returns `404` at the final SHA and a complete final-SHA tree proves the exact path is absent
- **THEN** the system leaves prior evidence for that path unchanged, continues the push projection, and does not report an application error or deletion

#### Scenario: Missing path cannot be proven stale

- **WHEN** a pushed task fetch returns `404` but the final-SHA absence check fails, is incomplete, or still contains the path
- **THEN** the system fails the projection with a sanitized GitHub diagnostic and retains the accepted delivery for bounded retry

#### Scenario: Explicitly removed task path

- **WHEN** the signed push payload explicitly classifies a task path as removed
- **THEN** the system removes that task evidence without requiring a final-SHA content fetch
