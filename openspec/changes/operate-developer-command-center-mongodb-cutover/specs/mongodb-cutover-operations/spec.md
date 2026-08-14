## Purpose

Defines the authorized production cutover from unused SQLite state to MongoDB while preserving only verified GitHub App installation bindings.

## ADDED Requirements

### Requirement: Exact prerequisite merge gate
The cutover SHALL NOT perform any repository, provider, credential, database, or deployment mutation until `replace-sqlite-with-mongodb` is merged, its exact merge SHA is verified on current `main`, and that SHA contains the complete validated MongoDB foundation. A branch, pull-request head, local commit, or stale `main` SHALL NOT satisfy the gate.

#### Scenario: Verified prerequisite
- **WHEN** the exact MongoDB foundation merge SHA is an ancestor of current `main` and its required checks and artifacts are complete
- **THEN** the cutover may continue to its separately authorized production prerequisites

#### Scenario: Missing or stale prerequisite
- **WHEN** the foundation is unmerged, the merge SHA cannot be verified, or current `main` does not contain it
- **THEN** the cutover stops before any external mutation

### Requirement: Superseded SQLite operation plan
The SQLite-specific `operate-developer-command-center-production` change SHALL be treated as superseded and SHALL be retired without syncing its stale SQLite operation requirements into canonical specs before this cutover executes. No task from both operational changes SHALL be executed as one combined plan.

#### Scenario: Competing operation remains active
- **WHEN** the SQLite operation change remains actionable or its disposition is ambiguous
- **THEN** the MongoDB cutover stops before production access or mutation

#### Scenario: Superseded operation retired
- **WHEN** the prior operation change is preserved as superseded history without publishing its SQLite deltas
- **THEN** this change becomes the sole executable production cutover plan

### Requirement: Fresh production authorization and preflight
Every production read or mutation SHALL use the approved bounded production access path and fresh task-scoped authorization appropriate to Railway or MongoDB. Before mutation, the operator SHALL verify the target project, environment, service, MongoDB database, deployment source behavior, credentials, network access, readiness configuration, and rollback target. Ambiguous or unexpected state SHALL fail closed.

#### Scenario: Production targets verified
- **WHEN** all target identities, access boundaries, source behavior, and rollback prerequisites match the reviewed plan
- **THEN** the operator may perform only the authorized cutover operations

#### Scenario: Unexpected automatic deploy or target
- **WHEN** source changes can deploy unexpectedly or any project, service, environment, database, credential, or rollback target is ambiguous
- **THEN** the cutover stops before mutation

### Requirement: Narrow binding handoff
While application writes are stopped, the operator SHALL read only the GitHub user ID, GitHub App installation ID, and installation account login for each existing user-installation binding from SQLite. The handoff SHALL contain exactly one user and every installation bound to that user. Every account login SHALL exactly equal `cubanx`, `Crisp-Inc`, or `hudson-law`; missing, duplicate, conflicting, additional-user, or unapproved records SHALL fail closed.

#### Scenario: Valid existing bindings
- **WHEN** SQLite contains one user with one or more distinct bindings whose account logins are exactly allowlisted
- **THEN** the operator may pass only those three-field records to the reviewed MongoDB binding-seed operation

#### Scenario: Ambiguous or unapproved bindings
- **WHEN** the binding query returns no user, more than one user, duplicate installation IDs, conflicting account identities, missing fields, or an unapproved account login
- **THEN** the cutover stops without seeding MongoDB

### Requirement: No general data migration
The cutover SHALL NOT transfer repositories, pull requests, deployments, OpenSpec progress, notifications, sessions, OAuth states, webhook deliveries, ETags, cached provider responses, or any other SQLite data. It SHALL NOT introduce dual writes, reverse migration, or historical backfill.

#### Scenario: Legacy non-binding rows exist
- **WHEN** SQLite contains non-binding application rows
- **THEN** the operator leaves those rows in SQLite and does not copy them to MongoDB

#### Scenario: Historical-data preservation requested implicitly
- **WHEN** a cutover command would transfer fields beyond the approved binding records
- **THEN** the operator rejects that command and stops for review

### Requirement: Idempotent binding seed
The operator SHALL seed the validated binding records through the foundation's reviewed maintenance operation into an empty or explicitly isolated target database. The seed SHALL be atomic for the user's binding set, idempotent when repeated with identical values, and fail without partial writes on conflict.

#### Scenario: First seed
- **WHEN** the target is empty and the validated handoff is supplied
- **THEN** one partial user aggregate is created with every approved binding and no provider projection history

#### Scenario: Identical retry
- **WHEN** the same validated handoff is supplied after an uncertain command result
- **THEN** the operation confirms the existing identical bindings without duplicating them

#### Scenario: Existing conflicting target data
- **WHEN** the target contains a conflicting user or installation binding
- **THEN** the operation fails without overwriting or partially merging the conflict

### Requirement: Sign-in without reinstallation
After the MongoDB runtime is deployed, the user SHALL complete one verified GitHub sign-in to establish a new hashed session and complete current user identity. The sign-in SHALL preserve every seeded installation binding and SHALL NOT require repeating the GitHub App installation or setup flow.

#### Scenario: First MongoDB sign-in
- **WHEN** the seeded user completes ordinary GitHub authentication
- **THEN** the system updates current profile identity, creates a hashed session, and retains every seeded binding

#### Scenario: Sign-in alters binding set
- **WHEN** ordinary sign-in would remove, replace, or add an installation binding without the verified installation setup flow
- **THEN** the system rejects that binding mutation and fails closed

### Requirement: Canonical bootstrap and activation verification
After sign-in, the operator SHALL rebuild repositories and active personal projections from GitHub using tokens scoped to each seeded installation. Production SHALL be considered activated only after MongoDB-backed readiness passes and bounded checks confirm user isolation, installation and repository authorization, allowlisted account identities, dashboard rendering, reconciliation recovery, webhook signature and idempotency behavior, notification deduplication, and absence of persisted broad OAuth user tokens.

#### Scenario: Successful bootstrap
- **WHEN** every seeded installation can be authenticated with an installation token and canonical bootstrap completes
- **THEN** the user's aggregate contains the current authorized projection and the dashboard can be activated

#### Scenario: Bootstrap or verification fails
- **WHEN** any installation cannot be verified, bootstrap is incomplete, readiness fails, or a security or behavior check fails
- **THEN** production is not declared active
- **AND** the operator proceeds to the reviewed rollback decision

### Requirement: Rollback preserves the old store
The cutover SHALL leave the SQLite store and prior deployable revision unchanged. If activation fails, rollback SHALL restore the prior code and configuration without attempting to copy MongoDB writes back to SQLite or automatically deleting MongoDB data. Deletion of the old volume or the new database SHALL require a separate explicit authorization and is outside this change.

#### Scenario: Rollback required
- **WHEN** deployment, sign-in, bootstrap, readiness, or verification fails
- **THEN** the operator restores the previously verified revision and SQLite configuration
- **AND** verifies the prior readiness contract before ending the attempt

#### Scenario: Cutover succeeds
- **WHEN** all activation checks pass
- **THEN** the operator records success and leaves destructive storage cleanup for a separate authorized decision

### Requirement: Bounded evidence
The operator SHALL record the prerequisite merge SHA, superseded-change disposition, production target identities, preflight results, binding count and allowlist result, seed result, deployment identity, readiness result, bootstrap result, verification outcomes, and rollback disposition. Evidence SHALL exclude secret values, raw tokens, credentials, and unrelated SQLite or MongoDB content.

#### Scenario: Cutover handoff
- **WHEN** the cutover succeeds, rolls back, or stops at a gate
- **THEN** the evidence identifies the exact completed steps and remaining blocker without exposing secrets or unrelated user data
