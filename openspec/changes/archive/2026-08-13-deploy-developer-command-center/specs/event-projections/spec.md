## MODIFIED Requirements

### Requirement: Incremental GitHub projections
The system SHALL update affected local pull-request, review, check, workflow, installation, repository, deployment, and deployment-status projections from supported signed GitHub webhook event/action pairs and SHALL ignore unknown pairs safely.

#### Scenario: Pull request state changes
- **WHEN** a supported pull-request webhook changes a tracked pull request
- **THEN** the installation-scoped projection is inserted, updated, or removed without listing all pull requests from GitHub

#### Scenario: Deployment status changes
- **WHEN** a signed `deployment` or `deployment_status` delivery changes a deployment in a selected repository
- **THEN** the installation-scoped GitHub deployment projection is inserted or updated idempotently without a Railway API read

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

#### Scenario: Legacy database opens
- **WHEN** a database contains legacy Railway projection tables
- **THEN** startup adds the GitHub-native deployment table without rebuilding or deleting legacy data
