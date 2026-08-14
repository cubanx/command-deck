## MODIFIED Requirements

### Requirement: Incremental GitHub projections
The system SHALL update affected local pull-request, review, check, workflow, installation, repository, deployment, and deployment-status projections from supported GitHub webhook event/action pairs, SHALL order deployment statuses by authoritative status identity and creation time, SHALL reject stale updates without replacing newer terminal state, and SHALL ignore unknown pairs safely.

#### Scenario: Pull request state changes
- **WHEN** a supported pull-request webhook changes a tracked pull request
- **THEN** the installation-scoped projection is inserted, updated, or removed without listing all pull requests from GitHub

#### Scenario: Deployment status delivery is stale
- **WHEN** a deployment-status delivery is older than or ordered before the currently projected status for that deployment
- **THEN** the projection retains the current status and records no cosmetic replacement

#### Scenario: Deployment reaches a terminal state
- **WHEN** a newer authoritative deployment status is successful, failed, inactive, or errored
- **THEN** a later-delivered stale pending or in-progress status cannot replace that terminal state
