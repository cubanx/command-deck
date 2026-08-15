## MODIFIED Requirements

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
