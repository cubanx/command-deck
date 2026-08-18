## Purpose

Defines the authorized production cutover from unused SQLite state to MongoDB while preserving only verified GitHub App installation bindings.

## ADDED Requirements

### Requirement: Exact prerequisite merge gate
The cutover SHALL NOT perform any repository, provider, credential, database, or deployment mutation until `replace-sqlite-with-mongodb`, `rename-command-center-identifiers`, and `fix-installation-identity` are merged, all exact merge SHAs are verified on refreshed current `main`, the foundation SHA contains the complete validated MongoDB foundation, the rename SHA contains the complete validated Command Center.ai naming change, and the installation identity fix SHA contains the focused credential-boundary regression. A branch, pull-request head, local commit, or stale `main` SHALL NOT satisfy any gate. The installation identity fix merge SHA SHALL be the deployment source, and separate production authorization SHALL still be required before deployment or provider operations.

#### Scenario: Verified prerequisite
- **WHEN** all exact prerequisite merge SHAs are ancestors of refreshed current `main` and their required checks and artifacts are complete
- **THEN** the cutover may continue to its separately authorized production prerequisites

#### Scenario: Missing or stale prerequisite
- **WHEN** any prerequisite is unmerged, any merge SHA cannot be verified, or refreshed current `main` does not contain all of them
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
Every production read or mutation SHALL use the approved bounded production access path and fresh task-scoped authorization appropriate to Railway or MongoDB. Before quiescing SQLite, the operator SHALL reconcile and verify Atlas project `command-center-ai`, cluster `command-center-ai`, shared database `command-center-ai-production`, runtime user `command-center-ai-production-runtime` with only the required database scope, the matching database/credential projection in the exact Railway target `Command Deck.ai` / `production` / `developer-command-center`, deployment source behavior, network access, readiness configuration, and rollback targets. Ambiguous or unexpected state SHALL fail closed.

#### Scenario: Production targets verified
- **WHEN** all exact target identities, least-privilege grants, credential destinations, source behavior, and rollback prerequisites match the reviewed plan
- **THEN** the operator may perform only the authorized cutover operations

#### Scenario: Unexpected automatic deploy or target
- **WHEN** source changes can deploy unexpectedly, the exact Railway target disagrees with the approved projection, or any project, service, environment, database, credential, or rollback target is ambiguous
- **THEN** the cutover stops before mutation

### Requirement: Narrow binding handoff
While application writes are stopped, the operator SHALL read only the GitHub user ID, GitHub App installation ID, and installation account login for each existing user-installation binding from SQLite. The handoff SHALL contain exactly one user and every installation bound to that user. Every account login SHALL exactly equal `cubanx`, `Crisp-Inc`, or `hudson-law`; missing, duplicate, conflicting, additional-user, or unapproved records SHALL fail closed, except only the observed missing account login for `(github_user_id=362276, installation_id=153423118)` may be reconstructed as exact `Crisp-Inc` after live authoritative GitHub App installation ownership proves that ID belongs to `Crisp-Inc`, the user interactively confirms the complete resulting tuple, and evidence records the source and proof.

#### Scenario: Valid existing bindings
- **WHEN** SQLite contains one user with one or more distinct bindings whose account logins are exactly allowlisted
- **THEN** the operator may pass only those three-field records to the reviewed MongoDB binding-seed operation

#### Scenario: Authorized exact missing account login reconstruction
- **WHEN** the sole binding row is `(362276, 153423118, NULL)`, live authoritative GitHub App installation ownership proves installation `153423118` belongs to exact `Crisp-Inc`, and the user interactively confirms `(362276, 153423118, Crisp-Inc)`
- **THEN** the operator may treat that confirmed tuple as complete and pass only its three fields to the reviewed MongoDB binding-seed operation

#### Scenario: Ambiguous or unapproved bindings
- **WHEN** the binding query returns no user, more than one user, duplicate installation IDs, conflicting account identities, an unapproved account login, or any missing field other than the authorized exact reconstruction above
- **THEN** the cutover stops without seeding MongoDB

### Requirement: No general data migration
The cutover SHALL NOT transfer repositories, pull requests, deployments, OpenSpec progress, notifications, sessions, OAuth states, webhook deliveries, ETags, cached provider responses, or any other SQLite data. It SHALL NOT introduce dual writes, reverse migration, or historical backfill.

#### Scenario: Legacy non-binding rows exist
- **WHEN** SQLite contains non-binding application rows
- **THEN** the operator leaves those rows in SQLite and does not copy them to MongoDB

#### Scenario: Historical-data preservation requested implicitly
- **WHEN** a cutover command would transfer fields beyond the approved binding records
- **THEN** the operator rejects that command and stops for review

### Requirement: Idempotent binding handoff or final-state acceptance
When execution is required, the operator SHALL seed validated bindings through the reviewed maintenance operation. When the exact reviewed MongoDB runtime is already active, the operator MAY instead accept the observed final binding after authoritative ownership proof and user confirmation, without claiming a seed ran. A seed remains atomic, idempotent for identical values, and fails without partial writes on conflict.

#### Scenario: First seed
- **WHEN** the target is empty and the validated handoff is supplied
- **THEN** one partial user aggregate is created with every approved binding and no provider projection history

#### Scenario: Identical retry
- **WHEN** the same validated handoff is supplied after an uncertain command result
- **THEN** the operation confirms the existing identical bindings without duplicating them

#### Scenario: Existing conflicting target data
- **WHEN** the target contains a conflicting user or installation binding
- **THEN** the operation fails without overwriting or partially merging the conflict

#### Scenario: Final binding state is already active
- **WHEN** the exact reviewed MongoDB runtime is active and evidence proves confirmed binding, current identity/session, approved projection, readiness, and retained rollback material
- **THEN** the operator may accept final state without replaying seed or deployment and without claiming historical execution

### Requirement: Sign-in without reinstallation
After the MongoDB runtime is deployed, the user SHALL complete one verified GitHub sign-in to establish a new hashed session and complete current user identity. The sign-in SHALL preserve every seeded installation binding and SHALL NOT require repeating the GitHub App installation or setup flow.

#### Scenario: First MongoDB sign-in
- **WHEN** the seeded user completes ordinary GitHub authentication
- **THEN** the system updates current profile identity, creates a hashed session, and retains every seeded binding

#### Scenario: Sign-in alters binding set
- **WHEN** ordinary sign-in would remove, replace, or add an installation binding without the verified installation setup flow
- **THEN** the system rejects that binding mutation and fails closed

### Requirement: Canonical bootstrap or final-state activation verification
When execution is required after sign-in, the operator SHALL rebuild projections using installation-scoped tokens. When the exact reviewed runtime is already active, production MAY instead be accepted from bounded final-state evidence: exact SHA, target identity/least privilege, approved projection, readiness, confirmed binding, identity/session, observed projections, bounded webhook intake/deduplication, and retained rollback material. It SHALL record uncertainty rather than claim unobserved bootstrap, ordering, rejected-signature, retry/fan-out, or exhaustive reconciliation behavior.

#### Scenario: Successful bootstrap
- **WHEN** every seeded installation can be authenticated with an installation token and canonical bootstrap completes
- **THEN** the user's aggregate contains the current authorized projection and the dashboard can be activated

#### Scenario: Final state is accepted without replay
- **WHEN** bounded evidence proves the exact reviewed runtime is active with required identities, readiness, binding, session, projection, webhook intake/deduplication, and rollback material
- **THEN** activation may be accepted without replaying operations and records historical execution gaps

#### Scenario: Bootstrap or verification fails
- **WHEN** any installation cannot be verified, bootstrap is incomplete, readiness fails, or a security or behavior check fails
- **THEN** production is not declared active
- **AND** the operator proceeds to the reviewed rollback decision

### Requirement: Rollback preserves the old store
The cutover SHALL leave the SQLite store and prior deployable revision unchanged. If activation fails, rollback SHALL restore the prior code and configuration without copying MongoDB writes back to SQLite or deleting MongoDB data. If final-state core acceptance passes, no rollback is executed. Deletion requires separate authorization and is outside this change.

#### Scenario: Rollback required
- **WHEN** deployment, sign-in, bootstrap, readiness, or verification fails
- **THEN** the operator restores the previously verified revision and SQLite configuration
- **AND** verifies the prior readiness contract before ending the attempt

#### Scenario: Cutover succeeds
- **WHEN** all activation checks pass
- **THEN** the operator records success and leaves destructive storage cleanup for a separate authorized decision

### Requirement: Bounded evidence
The operator SHALL record prerequisite SHA, superseded-change disposition, target identities, preflight results, binding/allowlist result, deployment identity, readiness, bounded final-state verification, and rollback disposition. Final-state acceptance SHALL distinguish observed facts from history and SHALL NOT claim seed, ordering, bootstrap, or exhaustive webhook/reconciliation semantics not observed. Evidence excludes secrets, raw tokens, credentials, and unrelated content.

#### Scenario: Cutover handoff
- **WHEN** the cutover succeeds, rolls back, or stops at a gate
- **THEN** the evidence identifies the exact completed steps and remaining blocker without exposing secrets or unrelated user data
