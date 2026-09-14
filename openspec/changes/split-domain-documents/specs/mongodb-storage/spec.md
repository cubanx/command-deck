## MODIFIED Requirements

### Requirement: User-owned aggregate
The system SHALL persist each user by stable GitHub ID with identity and personal preferences only. Installations, user-installation bindings, repositories, PRs, and deployments SHALL have independent documents. Shared provider objects SHALL be stored once by stable identity and selected only through authorized installation relationships.

#### Scenario: Personal projection read
- **WHEN** an authenticated user requests the dashboard
- **THEN** identity and authorized domain records are read without loading an embedded user activity aggregate.

#### Scenario: Multiple bound installations
- **WHEN** a user has multiple verified bindings
- **THEN** their authorized repositories can be selected through all bindings.

#### Scenario: Shared installation fan-out
- **WHEN** two users share an installation
- **THEN** one domain update serves both users without rewriting either user document.

### Requirement: Independent operational collections
The system SHALL keep hashed sessions, hashed OAuth states, exact-head single-use merge intents, webhook deliveries, and reconciliation runs independent of domain documents. ETags SHALL accompany the data they validate; no standalone generic response cache or notification collection SHALL be required by the runtime.

#### Scenario: Session and OAuth expiry
- **WHEN** authentication material has expired
- **THEN** it is rejected even before TTL cleanup.

#### Scenario: Webhook delivery deduplication
- **WHEN** a retained provider/delivery identity is received again
- **THEN** the existing receipt controls retries without duplicate effects.

#### Scenario: Merge head changes
- **WHEN** a merge intent targets a different head from the current PR
- **THEN** the intent cannot authorize the merge.

#### Scenario: Notification transition deduplication
- **WHEN** the same previously notification-producing transition is processed repeatedly
- **THEN** no durable notification is created; only domain state and authorized card refresh remain

### Requirement: Stable-identity projection updates
The system SHALL uniquely identify installations by installation ID, bindings by user and installation IDs, repositories by repository ID, PRs by repository ID and number, and deployments by repository ID and deployment ID. Updates SHALL preserve concurrent unrelated changes and reject stale evidence. Unchanged projected state SHALL NOT cause a cosmetic domain rewrite.

#### Scenario: Duplicate provider event
- **WHEN** the same provider object is projected again
- **THEN** one document retains the latest accepted evidence.

#### Scenario: Concurrent webhook and reconciliation
- **WHEN** a webhook changes evidence after reconciliation read it
- **THEN** the stale refresh cannot overwrite the newer evidence.

#### Scenario: Independent PR updates
- **WHEN** two PRs change
- **THEN** neither update replaces a common user or repository document.

### Requirement: Complete-snapshot replacement
The system SHALL retain last successful evidence on incomplete provider refresh. Absence-based removal SHALL occur only after every required page for the relevant resource scope succeeds and SHALL NOT discard a concurrent newer update. Complete installation-wide atomic replacement SHALL NOT be required.

#### Scenario: Provider page or request failure
- **WHEN** a required page fails
- **THEN** prior evidence remains available as stale and no record is removed on the basis of the incomplete list.

#### Scenario: Successful reconciliation
- **WHEN** a complete resource listing succeeds
- **THEN** records authoritatively absent within that scope are removed or marked absent without touching other scopes.

### Requirement: Bounded aggregate growth
The system SHALL keep PR lifecycle summaries and embedded OpenSpec evidence bounded per PR, and each deployment in its own document without unbounded status history. Users, installations, and repositories SHALL NOT accumulate activity arrays. Oversized document writes SHALL fail safely below the BSON limit while preserving prior state.

#### Scenario: Pull request closes
- **WHEN** a PR merges with incomplete post-merge obligations
- **THEN** its document and card remain until those obligations complete.

#### Scenario: Aggregate approaches size ceiling
- **WHEN** a proposed domain document exceeds the safe limit
- **THEN** the prior document is preserved and sanitized diagnostics identify the affected domain identity.

### Requirement: No general SQLite migration path
The runtime SHALL NOT read or import legacy SQLite or embedded Mongo user projections, dual-write old and new models, or provide reverse migration. A fresh store SHALL be populated through verified sign-in, installation connection, and canonical reconciliation.

#### Scenario: MongoDB application startup
- **WHEN** the new runtime starts on an empty approved database
- **THEN** it initializes the new model without inspecting legacy data.

#### Scenario: Legacy data exists
- **WHEN** old sessions, preferences, history, or projections exist
- **THEN** they are not carried forward.

## ADDED Requirements

### Requirement: Completed webhook receipt retention
The system SHALL expire done and ignored receipts 72 hours after processing while preserving pending, pending-verification, and rejected receipts. It SHALL retain receipt, processing-start, and completion timestamps sufficient to distinguish queue wait from execution. Completion SHALL clear raw payloads.

#### Scenario: Completed receipt expires
- **WHEN** a done or ignored receipt reaches 72 hours after processing
- **THEN** it becomes eligible for native database expiry.

#### Scenario: Incomplete receipt ages
- **WHEN** a pending or rejected receipt is older than 72 hours
- **THEN** terminal-success retention does not delete it.

## REMOVED Requirements

### Requirement: Narrow binding seed
**Reason**: Clean startup uses verified sign-in and connection.
**Migration**: Use the normal verified connection and reconciliation flow; remove the maintenance binding seed.
