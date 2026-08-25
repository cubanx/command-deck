## MODIFIED Requirements

### Requirement: Durable idempotent GitHub intake
The system SHALL verify the raw GitHub request body with a timing-safe SHA-256 HMAC comparison, enforce a body-size limit, and require valid `X-GitHub-Delivery` and `X-GitHub-Event` headers before parsing or persistence. Once those trust-boundary checks pass, it SHALL persist the delivery before installation, account, repository, or binding resolution, acknowledge duplicate delivery identifiers idempotently, and SHALL NOT silently drop or terminally reject a verified delivery because identity is unresolved.

#### Scenario: Valid new GitHub delivery
- **WHEN** a request has a valid signature, valid unused delivery identifier, valid event header, and a body within the accepted limit
- **THEN** the system durably queues it before identity resolution and returns `202` before projection processing

#### Scenario: Missing account resolved from installation binding
- **WHEN** a supported correctly signed payload has installation ID, no installation account login, and approved bindings resolve to exactly one normalized account
- **THEN** durably queue original payload before projection, inbox verification records bound account, projects exactly once, clears payload only after success

#### Scenario: Redelivered GitHub event
- **WHEN** a valid request reuses an already persisted delivery identifier
- **THEN** the system acknowledges it as idempotent success without applying projections or notifications twice

#### Scenario: Invalid GitHub signature
- **WHEN** signature validation fails
- **THEN** the system rejects the request without parsing or persisting the payload

#### Scenario: Installation account is missing or unapproved
- **WHEN** a correctly signed delivery has valid delivery identity but its installation account cannot yet be authorized
- **THEN** the system durably retains its original payload as retryable `pending_verification` with sanitized reason and timestamps and performs no unauthorized projection

#### Scenario: GitHub envelope is invalid
- **WHEN** the body is oversized or malformed or a required delivery or event header is missing or invalid
- **THEN** the system rejects the unverified request without persisting it

### Requirement: Incremental GitHub projections
The system SHALL update affected local pull-request, review, check, workflow, installation, repository, deployment, and deployment-status projections from supported GitHub webhook event/action pairs, SHALL keep the `workflow_run` Actions aggregate distinct from the `check_run`/`check_suite` Checks aggregate, SHALL retain authoritative failed-workflow identity, name, and safe GitHub run URL without inventing detail from scalar conclusions, SHALL order deployment statuses by authoritative status identity and creation time, SHALL reject stale updates without replacing newer terminal state, and SHALL record an explicit durable outcome for verified unsupported pairs.

#### Scenario: Pull request state changes
- **WHEN** a supported pull-request webhook changes a tracked pull request
- **THEN** the installation-scoped projection is inserted, updated, or removed without listing all pull requests from GitHub

#### Scenario: Deployment status changes
- **WHEN** a signed `deployment` or `deployment_status` delivery from an approved installation account changes a deployment in a selected repository
- **THEN** the installation-scoped GitHub deployment projection is inserted or updated idempotently without a Railway API read

#### Scenario: Retained delivery has an unapproved installation account
- **WHEN** a verified delivery is processed with a missing, ambiguous, conflicting, or currently unavailable installation account or binding
- **THEN** it remains retryable `pending_verification` with its payload intact, produces no unauthorized projection or notification mutation, and remains available to later binding, startup, or provider repair

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

### Requirement: Recoverable inbox processing
The system SHALL retry pending accepted and `pending_verification` deliveries with bounded backoff after process startup and after relevant binding or provider repair. It SHALL clear raw payload bodies only after successful exactly-once processing or an explicitly recorded supported no-op, while retaining delivery identity, sanitized outcome, retry timestamps, and repair attribution. Exhausted or temporarily blocked retries SHALL remain durable and SHALL surface through sanitized operational telemetry or alerts.

#### Scenario: Process stops after acknowledgement
- **WHEN** the service restarts with a pending accepted or `pending_verification` delivery
- **THEN** the worker resumes it without requiring provider redelivery

#### Scenario: Identity resolution is temporarily unavailable
- **WHEN** a verified delivery cannot resolve installation, account, repository, or binding because evidence is missing, ambiguous, conflicting, or temporarily unavailable
- **THEN** bounded retries retain the original payload and sanitized attempt history without terminal rejection

#### Scenario: Identity later resolves
- **WHEN** later binding or provider evidence authoritatively resolves a retained verified delivery
- **THEN** the original delivery is projected exactly once, its payload is cleared, and its durable sanitized outcome records successful resolution

#### Scenario: Authoritative reconciliation repairs unresolved delivery
- **WHEN** a successful authoritative reconciliation supersedes the data effect of a retained unresolved delivery
- **THEN** the delivery records reconciliation repair attribution and retains its sanitized diagnostic trail without applying the event effect twice or deleting the trail prematurely

## ADDED Requirements

### Requirement: Lifecycle-relevant webhook repair
The system SHALL use signed lifecycle-relevant webhook events as low-latency hints to reconcile only the affected authorized pull request. Supported hints SHALL include open `pull_request` actions, `pull_request_review`, `pull_request_review_comment`, `pull_request_review_thread` resolution, `check_run`, `check_suite`, `workflow_run`, and commit `status`. The system SHALL correlate check, workflow, and status events by authoritative PR association or exact locally known head SHA, SHALL coalesce bursts for the same installation and PR, and SHALL use the resulting provider read rather than infer aggregate thread or policy satisfaction from one event.

#### Scenario: Open pull request changes
- **WHEN** any signed `pull_request` action identifies an authorized open pull request
- **THEN** the system directly projects available payload state and schedules targeted reconciliation for only that PR

#### Scenario: Pull request closes
- **WHEN** a signed `pull_request` event authoritatively closes or merges a projected PR
- **THEN** the system removes it immediately without running targeted reconciliation

#### Scenario: Review evidence changes
- **WHEN** a signed review, review-comment, or resolved-review-thread event identifies an authorized open pull request
- **THEN** the system schedules targeted reconciliation for only that PR and does not infer that all threads are resolved from the event alone

#### Scenario: Check or workflow evidence changes
- **WHEN** a signed check-run, check-suite, workflow-run, or commit-status event identifies a PR or exact known PR head SHA
- **THEN** the system schedules targeted reconciliation for each exact matching authorized open PR

#### Scenario: Multiple hints arrive together
- **WHEN** multiple lifecycle hints for the same installation and PR arrive within the debounce window or while its reconciliation is running
- **THEN** the system performs one coalesced reconciliation and at most one follow-up when a newer hint arrived during the read

#### Scenario: Event cannot identify a pull request
- **WHEN** a lifecycle hint has neither authoritative PR association nor an exact locally known head-SHA match
- **THEN** the system records no guessed PR mutation and relies on scheduled or manual repair

### Requirement: Deployment-to-pull-request correlation evidence
The system SHALL retain bounded recent merged-pull-request number, title, URL, head SHA, merge SHA, and merge time from signed PR events and SHALL correlate a deployment to a pull request only by exact deployment-SHA equality with retained head or merge SHA evidence. It MUST NOT parse a ref, title, branch name, or commit message to invent correlation.

#### Scenario: Preview deployment precedes merge
- **WHEN** a deployment SHA exactly matches the head SHA of a currently projected open PR
- **THEN** the deployment retains that PR number, title, and URL without an additional provider read

#### Scenario: Production deployment follows merge
- **WHEN** a deployment SHA exactly matches a retained recent merge SHA
- **THEN** the deployment retains that PR number, title, and URL without an additional provider read

#### Scenario: Pull request closes before deployment
- **WHEN** a merged PR is removed from the open-PR projection
- **THEN** its bounded correlation evidence remains available for at least the 48-hour deployment-display window

#### Scenario: Deployment correlation is unavailable
- **WHEN** no exact retained head or merge SHA matches a deployment
- **THEN** the deployment remains visible with its repository and SHA available for a safe commit link but no guessed PR identity
