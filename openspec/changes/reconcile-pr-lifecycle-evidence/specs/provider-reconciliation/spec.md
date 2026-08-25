## MODIFIED Requirements

### Requirement: Installation-token provider reads
The system SHALL use GitHub App installation access tokens for repository automation reads, SHALL authoritatively verify that the installation account is `cubanx`, `Crisp-Inc`, or `hudson-law` before repository or deployment reads and projection mutation, SHALL retrieve every page of repositories and open pull requests available to the approved installation during bootstrap or explicit installation reconciliation, and MUST NOT use a developer's GitHub user token for projection bootstrap or reconciliation.

#### Scenario: Bootstrap reads repository state
- **WHEN** a developer explicitly requests bootstrap for a bound installation whose account is approved
- **THEN** the system verifies and stores its authoritative account login before every page of GitHub repository and open-pull-request reads uses a freshly minted token for that installation

#### Scenario: Verified OAuth binding completes
- **WHEN** an approved installation is durably bound through the verified OAuth callback
- **THEN** the system schedules the same canonical installation-token bootstrap path directly and returns the callback redirect without waiting for provider pagination

#### Scenario: Callback-triggered bootstrap fails
- **WHEN** token creation or canonical bootstrap fails after callback binding
- **THEN** the system logs a sanitized failure, preserves the binding and existing projections, and allows explicit installation reconciliation to retry

#### Scenario: Installation account is missing locally
- **WHEN** a legacy installation has no stored account login and GitHub authoritatively identifies it as an approved account
- **THEN** the system backfills the account login and may continue bootstrap without deleting prior metadata

#### Scenario: Installation account is unapproved
- **WHEN** a stored or authoritative installation account login is outside the exact allowlist or missing from the authoritative response
- **THEN** bootstrap and reconciliation perform no repository or deployment list reads, mutate no projections, and retain prior metadata as inert

#### Scenario: Installation exceeds one provider page
- **WHEN** a bootstrap or explicit installation reconciliation has more repositories or open pull requests than one provider page contains
- **THEN** it projects all authorized pages without silently truncating the installation

### Requirement: Narrow provider read paths
The system SHALL reserve provider reads for installation bootstrap, one startup installation repair after inbox drain, explicit installation repair, targeted PR lifecycle repair, explicit detail views, changed committed OpenSpec artifacts, and the bounded business-hours reconciliation of currently known PRs. It SHALL NOT schedule periodic broad installation reconciliation.

#### Scenario: Normal webhook update
- **WHEN** a supported webhook contains enough state to update a projection
- **THEN** the system immediately applies that payload state and performs no installation list or search request

#### Scenario: Lifecycle webhook needs aggregate truth
- **WHEN** a supported lifecycle webhook identifies an authorized open PR
- **THEN** the system may perform only that PR's targeted authoritative reads after direct projection and coalescing

#### Scenario: Broad repair is not scheduled
- **WHEN** installation bootstrap and the one startup repair have completed and no developer requests installation reconciliation
- **THEN** the system performs no periodic repository, deployment, or installation-wide scan

### Requirement: User-scoped immediate reconciliation
An authenticated developer SHALL be able to request targeted reconciliation for one authorized projected PR, targeted reconciliation for every currently known authorized open PR, or broad installation reconciliation for only approved installations bound to that signed-in user. All-PR reconciliation SHALL reuse the one-PR operation and MUST NOT discover an entirely missing PR. Installation reconciliation SHALL remain the explicit discovery and repository-policy refresh path.

#### Scenario: User requests immediate reconciliation
- **WHEN** the signed-in user requests any supported reconciliation operation
- **THEN** the system limits provider work to that user's approved installation bindings and the selected PR, known-PR, or installation scope

#### Scenario: User requests one-PR reconciliation
- **WHEN** the signed-in user requests repair for one authorized projected open PR
- **THEN** the system reconciles only that PR and returns not found for an unauthorized, unknown, or closed target

#### Scenario: User requests all-PR reconciliation
- **WHEN** the signed-in user confirms repair for all known PRs
- **THEN** the system reconciles each currently known authorized open PR without listing installation repositories or discovering missing PRs

#### Scenario: User requests installation reconciliation
- **WHEN** the signed-in user confirms broad repair
- **THEN** the system reconciles only that user's approved bound installations, discovers current repositories and PRs, refreshes deployments and OpenSpecs, and refreshes repository policy

#### Scenario: User has no eligible installation
- **WHEN** the signed-in user has no approved bound installation
- **THEN** the request returns not found without starting provider work

## ADDED Requirements

### Requirement: Authoritative targeted PR lifecycle repair
The system SHALL repair one authorized PR from current provider evidence for open/draft state, opened time, exact head SHA, conflict-free mergeability, completed reviews, current changes-requested state, every review thread's resolution state, current-head checks and Actions, labels, and every correlated committed OpenSpec task projection. The OpenSpec collection SHALL include every exact-head match or, only when none exists, every unique-branch match, deterministically sorted and deduplicated; its first item SHALL remain available only through the existing singular compatibility field. It SHALL fail closed on incomplete pagination or indeterminate required evidence and SHALL remove the target when provider evidence shows it is closed.

#### Scenario: Targeted repair succeeds
- **WHEN** every required provider page for an authorized open PR is retrieved successfully
- **THEN** the system atomically replaces that PR's lifecycle evidence and refreshes affected user snapshots

#### Scenario: Targeted repair finds multiple correlated OpenSpecs
- **WHEN** provider evidence identifies multiple exact-head OpenSpec matches or, with no exact-head match, multiple unique-branch matches
- **THEN** targeted repair projects every deterministically sorted and deduplicated correlated OpenSpec without treating multiple matches as ambiguous

#### Scenario: Review threads exceed one page
- **WHEN** review-thread results are paginated
- **THEN** the system reads through the final page before asserting that all threads are resolved

#### Scenario: Any review thread is unresolved
- **WHEN** one or more authoritative review-thread nodes has `isResolved=false`
- **THEN** the projection retains an unresolved-thread blocker and does not claim Mergeable

#### Scenario: Targeted repair is incomplete
- **WHEN** any required provider page or exact-head correlation fails after bounded retries
- **THEN** the system preserves prior lifecycle evidence, marks the target stale, and does not claim a later lifecycle stage

#### Scenario: Provider reports target closed
- **WHEN** targeted repair authoritatively reports that the PR is closed or merged
- **THEN** the system removes that PR from the open dashboard projection

### Requirement: Cached target-repository merge policy
The system SHALL cache each watched repository's applicable default-branch rulesets and classic protection requirements, including required status-check contexts and other merge rules used by the lifecycle gate. Policy SHALL refresh only during installation bootstrap or explicit `Reconcile installation`, SHALL retain the previous successful cache on failure, and SHALL record the last successful refresh time. PR repair SHALL evaluate required checks against the cached target-repository policy and exact current head without fetching policy per PR.

#### Scenario: Installation policy refresh succeeds
- **WHEN** installation bootstrap or explicit installation reconciliation reads applicable repository rules successfully
- **THEN** the system atomically stores the policy and its successful refresh time for later PR evaluation

#### Scenario: Policy refresh fails
- **WHEN** any repository-policy read fails or is incomplete
- **THEN** the system preserves that repository's previous successful policy, records sanitized stale state, and does not replace it with partial rules

#### Scenario: Policy has never been loaded
- **WHEN** an open PR's repository has no successful cached policy
- **THEN** targeted repair may update other evidence but cannot satisfy the Mergeable policy gate

#### Scenario: Non-required check fails
- **WHEN** an exact-head check is visible but is not required by cached target-repository policy
- **THEN** the system retains it as informational evidence without adding a required-check blocker

### Requirement: Weekday scheduled PR repair
The system SHALL reconcile all currently known authorized open PRs every ten minutes on Monday through Friday from 07:00 inclusive until 19:00 exclusive in the DST-aware `America/New_York` time zone. It SHALL run at 07:00 and then through 18:50, SHALL perform no scheduled PR repair outside that window, and SHALL leave webhook and manual repair available at all times.

#### Scenario: Business-hours schedule starts
- **WHEN** local New York time reaches 07:00 on a weekday
- **THEN** the system starts one all-known-PR repair and schedules later runs at ten-minute boundaries through 18:50

#### Scenario: Schedule is outside its window
- **WHEN** local New York time is a weekend or is before 07:00 or at or after 19:00
- **THEN** the system starts no scheduled PR repair

#### Scenario: Scheduled run overlaps existing work
- **WHEN** the next ten-minute boundary arrives while reconciliation for the same installation is active
- **THEN** the system coalesces or skips duplicate targets rather than starting parallel provider reads

### Requirement: One startup installation repair
After application initialization drains the durable webhook inbox, the system SHALL start exactly one non-blocking installation reconciliation through the existing broad reconciliation helper and single-flight or coalescing boundary. A complete startup snapshot SHALL discover missed open pull requests and remove projected pull requests that are authoritatively closed or merged. Partial or failed provider work SHALL preserve prior snapshots, record existing sanitized reconciliation diagnostics, and SHALL NOT crash startup or make readiness depend on provider completion.

#### Scenario: Missed close is repaired at startup
- **WHEN** a projected pull request closed or merged while its webhook was missed before the application starts
- **THEN** the post-drain startup reconciliation removes it from the complete installation snapshot

#### Scenario: Missed open is discovered at startup
- **WHEN** an authorized pull request opened while its webhook was missed before the application starts
- **THEN** the post-drain startup reconciliation discovers and projects it from the complete installation snapshot

#### Scenario: Startup repair runs once
- **WHEN** startup inbox drain completes while another installation reconciliation is active or becomes queued
- **THEN** the startup request reuses the existing single-flight or coalescing boundary and starts no parallel or second startup installation scan

#### Scenario: Startup repair fails
- **WHEN** startup installation reconciliation receives partial or failed provider evidence
- **THEN** prior projected state is preserved, existing sanitized reconciliation diagnostics record the failure, startup continues, and readiness remains independent of the repair result

### Requirement: Reconciliation concurrency and freshness
The system SHALL serialize provider reconciliation within an installation, maintain a deduplicated set of pending PR targets, and prevent an older webhook or provider response from replacing lifecycle evidence known to be newer by provider update time, exact head SHA, or terminal status ordering. Reconciliation reads MUST NOT mutate GitHub and therefore MUST NOT create a provider webhook loop.

#### Scenario: Event arrives during targeted repair
- **WHEN** a newer lifecycle hint for the same PR arrives while its provider read is active
- **THEN** the system marks that PR for one follow-up repair after the active read rather than running parallel work

#### Scenario: Different PRs are queued together
- **WHEN** several PRs in one installation need repair
- **THEN** the system serially processes each unique target without dropping one or scanning unrelated repositories

#### Scenario: Older evidence arrives late
- **WHEN** an older webhook or response would overwrite a newer head, update time, or terminal state
- **THEN** the system retains the newer evidence and records no cosmetic regression

### Requirement: Bounded reconciliation-run telemetry
The system SHALL persist one aggregate operational record for every scheduled, webhook-triggered, startup, or manual reconciliation run, including no-op runs. Each record SHALL contain installation identity, trigger category, start and completion times, duration, PR count, provider-request count, changed and unchanged PR counts, aggregate changed-field categories, failure count, and sanitized outcome. It MUST NOT contain PR numbers, titles, head SHAs, review text, provider URLs, headers, tokens, raw payloads, or stack traces. Records SHALL expire automatically 14 days after completion and SHALL not be exposed through the dashboard or application API.

#### Scenario: Reconciliation changes no PRs
- **WHEN** a reconciliation completes without changing lifecycle evidence
- **THEN** the system retains a no-op run record so operational analysis can measure the useful-run rate

#### Scenario: Reconciliation changes projected categories
- **WHEN** a run changes one or more PRs
- **THEN** its record counts changed PRs and aggregates changes by state/draft, OpenSpec, review threads, required checks, Actions, mergeability, or other bounded lifecycle category without identifying the PRs

#### Scenario: Telemetry reaches retention limit
- **WHEN** a run record becomes older than 14 days
- **THEN** MongoDB removes it through bounded expiry without rewriting the user aggregate

#### Scenario: Application user requests a snapshot
- **WHEN** any dashboard or configuration snapshot is returned
- **THEN** it contains no reconciliation-run records or raw telemetry fields
