## MODIFIED Requirements

### Requirement: Personal operational summary
The system SHALL present every authorized open pull request authored by the signed-in developer with title, PR number, opened time, draft state, attention classification, distinct Actions/check/formal-review/automated-review/mergeability evidence, a conditional guarded Merge control beside the linked title, every OpenSpec status confirmed by the authoritative exhaustive `## OpenSpecs` PR-body section, and detected changed-path candidates labeled as detected from changed files, plus recent authoritative GitHub deployment projections, from local installation-scoped projections. The confirmed OpenSpec collection SHALL be deterministically sorted and deduplicated; the first item MAY remain available only through the existing singular compatibility field. The default pull-request order SHALL be GitHub opened time ascending across all repositories, with unavailable opened times last and a deterministic stable identity fallback.

#### Scenario: Developer opens the command center
- **WHEN** a signed-in developer has projected state across one or more bound GitHub installations
- **THEN** the dashboard renders every open pull request authored by that developer within those installations without first polling provider list endpoints

#### Scenario: Pull request needs attention
- **WHEN** an authored open pull request is a draft, has requested changes, unresolved review threads, pending or failed required checks, a conflicting or unknown mergeability state, a missing repository-policy projection, or an applicable incomplete OpenSpec
- **THEN** the dashboard shows its linked title and PR number, lifecycle stage, attention state, Actions status, all other known status fields, and nested OpenSpec evidence in its authoritative status bucket

#### Scenario: Automated reviewer progress is known
- **WHEN** a configured bot-review signal has been projected for the pull request
- **THEN** the PR card shows the reviewer identity and whether its review is in progress or complete separately from formal review state

#### Scenario: Pull request is healthy
- **WHEN** an authored open pull request has no projected attention condition
- **THEN** the dashboard includes it with a clear healthy state in its authoritative status bucket

#### Scenario: Pull request moves backward in the lifecycle
- **WHEN** a pull request previously displayed as Mergeable receives projected evidence that no longer satisfies that stage
- **THEN** the dashboard displays its current earlier lifecycle stage and applicable warning without implying irreversible progress

#### Scenario: New commit has no blocking effect
- **WHEN** a new commit does not create new review activity, unresolved threads, required-check blockers, OpenSpec blockers, or conflicting or unknown mergeability evidence
- **THEN** the dashboard does not move the pull request backward solely because its head changed

#### Scenario: GitHub Actions workflow fails
- **WHEN** a signed `workflow_run` projection reports one or more failed workflows with authoritative names and GitHub run URLs
- **THEN** the PR card shows each failed workflow name linked to its run while preserving the separate Checks aggregate

#### Scenario: Pull request has a linked unfinished OpenSpec group
- **WHEN** one or more OpenSpecs are correlated to the pull request by repository identity and exact head or unique branch fallback
- **THEN** the PR card shows a collapsed native disclosure for every correlated OpenSpec whose summary contains the change name, total progress, current unfinished pre-merge group, readiness state, and existing Open tasks link
- **AND** expanding each disclosure shows that current group's disabled checked and unchecked source-state checklist

#### Scenario: Pull request has multiple correlated OpenSpecs
- **WHEN** more than one deterministically ordered and deduplicated OpenSpec is correlated to a pull request
- **THEN** the dashboard renders every correlated OpenSpec without treating the collection as ambiguous, while legacy consumers receive the first item through the existing singular field only

#### Scenario: OpenSpec directory listing does not render as evidence
- **WHEN** a repository snapshot lists OpenSpec artifacts at a pull request's head without accepted PR-specific correlation evidence
- **THEN** the dashboard renders none of those artifacts as pull-request OpenSpec evidence

#### Scenario: Detected OpenSpec candidates await body confirmation
- **WHEN** changed files detect OpenSpec candidates but the PR body has no authoritative `## OpenSpecs` declaration or exact exemption label
- **THEN** the dashboard renders the candidates in a labeled accessible unordered list, shows `Confirm OpenSpec association` as a blocker, and does not assign numeric order

#### Scenario: Authoritative declaration excludes detected candidates
- **WHEN** a valid authoritative `## OpenSpecs` declaration omits one or more changed-path candidates
- **THEN** the dashboard labels the omitted candidates as detected from changed files without treating them as task evidence or lifecycle blockers

#### Scenario: OpenSpec disclosure appears in any color scheme
- **WHEN** the dashboard renders collapsed or expanded OpenSpec evidence in System, Dark, or Light appearance
- **THEN** the disclosure uses a darker appearance-aware surface with readable text, links, borders, disclosure state, and visible keyboard focus rather than the contrasting near-white panel

#### Scenario: Same pull request is projected through multiple installations
- **WHEN** authorized installation snapshots contain the same GitHub pull request identity
- **THEN** the dashboard shows one current pull-request card

#### Scenario: Developer has no authored open pull requests
- **WHEN** the signed-in developer has no authorized open pull requests
- **THEN** the dashboard states that there are no open pull requests authored by that developer rather than claiming all projected work is healthy

#### Scenario: Recent deployments have mixed outcomes
- **WHEN** authoritative GitHub deployment projections were updated within the last 48 hours
- **THEN** the dashboard keeps their newest-first detail history while selecting only the newest completed success, failure, or error for the headline

#### Scenario: No Railway runtime access
- **WHEN** the dashboard renders deployment state
- **THEN** it does not require Railway connection mappings, Railway API credentials, or Railway webhook verification state

#### Scenario: Pull request merge permission is unavailable
- **WHEN** a pull-request card is not currently eligible for the guarded merge action
- **THEN** the card renders no Merge action while retaining its lifecycle stage and blocker evidence

### Requirement: Crisp-sibling visual semantics
The dashboard SHALL use a compact neutral shell, bordered cards, responsive grids or scroll-contained tables, plain operational labels, visible focus styles, and consistent semantic status colors. PR cards SHALL represent lifecycle status with the five compact Draft, OpenSpec ready, Ready for review, Reviewing, and Mergeable stages and reserve card-level status pills for a single actionable attention condition rather than default positive states.

#### Scenario: Narrow viewport
- **WHEN** the app is viewed in a narrow installed window
- **THEN** cards stack, tables remain horizontally accessible, and lifecycle status and actions remain readable

#### Scenario: Healthy PR status is presented
- **WHEN** a pull request has no attention condition
- **THEN** its lifecycle stages communicate the current state without a green or other positive-status pill

#### Scenario: Current lifecycle stage is scanned
- **WHEN** a developer scans a pull-request lifecycle group
- **THEN** the current stage is visually and programmatically distinguishable from the other stages with sufficient light and dark theme contrast

#### Scenario: Lifecycle frame is scanned
- **WHEN** a developer scans a pull-request card at normal width
- **THEN** the native `PR Lifecycle` fieldset legend interrupts its top border above its horizontal stages, wraps them only when width requires it, and gives its warning, if any, a separate spaced row below

#### Scenario: Developer configures local checkouts
- **WHEN** a developer opens Configuration with authorized repositories
- **THEN** the app presents accessible Unresolved and Resolved tables in that order, each sorted case-insensitively by full repository name, while retaining organization-root and per-repository checkout controls

### Requirement: Accessible deployment detail
The system SHALL present the newest completed success, failure, or error from the existing 48-hour deployment projection as a full detail-style header row beside the Command Center brand. When exact stored SHA evidence correlates the deployment to a pull request, the headline SHALL show linked PR number and title without repository, ref, or SHA text. Otherwise it SHALL show a linked short commit SHA without a visible repository name. It SHALL reuse the shared status-detail interaction to show the existing newest five deployment rows by default plus a native `More deployments` disclosure for remaining rows and their links, without a provider request, dependency, or large dashboard side card.

#### Scenario: Completed deployment correlates to a pull request
- **WHEN** the newest completed 48-hour deployment SHA exactly matches retained pull-request head or merge SHA evidence
- **THEN** the headline shows the pull-request number and title linked to GitHub with a success or failed status

#### Scenario: Completed deployment has no pull-request correlation
- **WHEN** the newest completed 48-hour deployment has no exact retained pull-request SHA match
- **THEN** the headline shows its linked short commit SHA with a success or failed status and does not guess a pull-request identity

#### Scenario: No completed deployment exists
- **WHEN** no success, failure, or error deployment exists in the 48-hour projection
- **THEN** the headline states that no completed deployment exists in the last 48 hours

#### Scenario: Developer inspects recent deployments
- **WHEN** a user hovers the header trigger after the short delay, focuses it, or clicks/taps it
- **THEN** the sticky detail shows the existing newest-first 48-hour deployment projections, including transient states, and their available target or log links until dismissed or replaced

### Requirement: Lifecycle stage and attention filters
The dashboard SHALL filter PR cards by the mutually exclusive Draft, OpenSpec ready, Ready for review, Reviewing, and Mergeable lifecycle stages, and SHALL provide attention/blocker filtering separately from those stages.

#### Scenario: Developer filters by lifecycle stage
- **WHEN** a developer selects a lifecycle stage filter
- **THEN** the dashboard shows only PR cards whose current projected lifecycle stage matches that selection

#### Scenario: Developer filters by attention
- **WHEN** a developer enables the attention filter
- **THEN** the dashboard shows PR cards with projected attention conditions regardless of their lifecycle stage

### Requirement: Exclusive pull-request status buckets
Every projected pull request SHALL belong to exactly one clickable lifecycle bucket with this precedence: remove closed or merged PRs; Draft for every GitHub draft; OpenSpec ready for a remaining PR with an applicable missing or incomplete OpenSpec gate; Ready for review for a remaining PR with no requested or completed review activity; Reviewing for a remaining PR that has review activity but does not meet every Mergeable gate; and Mergeable for a remaining PR with every correlated OpenSpec pre-merge ready, at least one completed human or bot review, no unresolved review threads, no current changes-requested review, every target-repository required check successful at the exact current head, loaded repository policy, and authoritative conflict-free mergeability. Non-required checks and Actions SHALL remain visible without blocking Mergeable. The guarded Merge control SHALL require the same every-correlated-OpenSpec readiness at action time while retaining its existing exact-head revalidation.

#### Scenario: Draft pull request is authoritatively mergeable
- **WHEN** a GitHub draft has complete OpenSpec, review, check, policy, and mergeability evidence
- **THEN** it belongs only to the Draft bucket and shows completed subordinate gates without advancing

#### Scenario: OpenSpec gate is incomplete
- **WHEN** a non-draft pull request has an applicable missing or incomplete OpenSpec
- **THEN** it belongs only to the OpenSpec ready bucket even when later review or check evidence exists

#### Scenario: One of multiple OpenSpecs is incomplete
- **WHEN** a non-draft pull request has multiple correlated OpenSpecs and any one has unfinished unmarked tasks
- **THEN** it remains in OpenSpec ready, renders every correlated OpenSpec, and neither lifecycle nor guarded Merge eligibility treats the collection as ready

#### Scenario: Pull request is ready for review
- **WHEN** a non-draft pull request has satisfied or exempt OpenSpec evidence and no requested or completed human or bot review activity
- **THEN** it belongs only to the Ready for review bucket

#### Scenario: Pull request is being reviewed
- **WHEN** a review was requested or human or bot review activity exists and any Mergeable gate is unmet or indeterminate
- **THEN** the pull request belongs only to the Reviewing bucket and shows its exact blockers

#### Scenario: Commented bot review is complete
- **WHEN** at least one completed bot review is recorded as `COMMENTED`, no review is currently changes-requested, every structured review thread is resolved, and all other Mergeable gates are satisfied
- **THEN** the pull request belongs only to the Mergeable bucket without requiring a formal `APPROVED` state

#### Scenario: Required check conclusion is acceptable
- **WHEN** every ruleset-required context at the exact current head is `success`, `neutral`, or `skipped`
- **THEN** the required-check gate is satisfied

#### Scenario: Required check is missing or not clear
- **WHEN** a required context is absent, queued, pending, in progress, failed, errored, timed out, cancelled, action-required, stale, or otherwise indeterminate at the exact current head
- **THEN** the pull request remains Reviewing and identifies the required-check blocker

#### Scenario: Repository policy is unavailable
- **WHEN** the target repository has no successfully cached applicable policy
- **THEN** the pull request cannot enter Mergeable and shows a policy-refresh blocker

#### Scenario: Status filters are selected
- **WHEN** the developer activates one or more status pills
- **THEN** only pull requests in those same mutually exclusive buckets remain visible

### Requirement: Persisted pull-request ordering
The dashboard SHALL offer Opened, Closest to merge, Codex activity, Recently updated, OpenSpec progress, and Repository sort modes with an explicit direction, SHALL default safely to Closest to merge ascending across all repositories, and SHALL persist only the allowlisted mode and direction browser-locally. Search, status, Actions, Checks, and repository controls SHALL filter before sorting. PR-number ordering SHALL NOT be offered as a global sort because PR numbers are repository-local.

#### Scenario: Opened ordering is calculated
- **WHEN** pull requests from one or more repositories have authoritative GitHub creation times
- **THEN** cards sort globally by creation time ascending by default, independent of repository, with deterministic stable identity fallback

#### Scenario: Opened time is unavailable
- **WHEN** a projected pull request has no authoritative creation time
- **THEN** it sorts after pull requests with known creation times and the dashboard does not infer an opened time from PR number or update time

#### Scenario: Closest-to-merge ordering is calculated
- **WHEN** the developer selects Closest to merge and pull requests have lifecycle blockers
- **THEN** later lifecycle stages rank first from Mergeable through Draft, then each unresolved category contributes exactly one named blocker, cards show the blocker count and exact blockers, and the order is blocker count ascending, valid OpenSpec progress descending, then stable identity

#### Scenario: Sort preference is restored
- **WHEN** a developer reloads after selecting a supported sort mode and direction
- **THEN** the browser-local preference is restored without server persistence or synchronization

#### Scenario: Stored sort preference is invalid
- **WHEN** storage is absent, corrupt, inaccessible, or contains an obsolete mode or direction
- **THEN** ordering falls back to Closest to merge ascending and exposes no raw storage error

#### Scenario: Developer selects another available sort
- **WHEN** Closest to merge, Recently updated, OpenSpec progress, or Repository is selected
- **THEN** the eligible cards use that mode and direction with unavailable values last and deterministic stable-identity fallback where values tie

#### Scenario: Codex activity data is unavailable
- **WHEN** the separate Codex-activity OpenSpec has not supplied valid browser-local ordering data
- **THEN** Codex activity is hidden or disabled with an accessible explanation and the dashboard does not fabricate, fetch, or infer activity order

#### Scenario: Codex activity data becomes available
- **WHEN** the separate Codex-activity contract supplies valid correlated ordering data
- **THEN** matched pull requests follow that order, unmatched pull requests follow matched pull requests, and ties or unmatched entries use Closest to merge then stable identity

#### Scenario: Developer clears filters
- **WHEN** the developer activates Clear
- **THEN** search and filter state reset while the persisted sort mode and direction remain selected

### Requirement: Authenticated avatar navigation and one configuration page
The dashboard SHALL make its combined brand mark and Command center hero one accessible home link and place the signed-in developer's validated GitHub avatar at the right edge of the navbar. Activating the avatar SHALL open a compact native accessible dropdown containing vertical System, Light, and Dark appearance menu choices, a checkmark on the active choice, a `Reconcile all PRs` action, and a gear-labelled Configuration link styled as menu rows. Configuration SHALL open a dedicated `/configuration` page that owns local checkout mappings and overrides, repository resolution states, existing notification permission configuration, `Reconcile all PRs`, and `Reconcile installation`. Appearance SHALL remain only in the avatar menu. The dashboard header and body SHALL NOT retain Connect local checkout, Enable notifications, or an inline configuration section.

The navbar and combined brand SHALL remain on one non-wrapping row with the logo, title, and avatar top-aligned while the subtitle remains beneath the title.

#### Scenario: Developer activates the brand
- **WHEN** the developer activates the combined navbar logo and Command center hero
- **THEN** one native link with one tab stop navigates to `/`

#### Scenario: Navbar renders across widths
- **WHEN** the dashboard header renders at wide or narrow supported widths
- **THEN** the logo, Command center title, and avatar share one stable top alignment without wrapping the brand apart from its subtitle

#### Scenario: Signed-in developer opens the avatar menu
- **WHEN** the developer activates their navbar avatar with pointer or keyboard input
- **THEN** a labeled native disclosure exposes vertical System, Light, and Dark menu choices with only the current selection checked, followed by `Reconcile all PRs` and a gear-labelled Configuration action in predictable focus order

#### Scenario: Developer opens configuration
- **WHEN** the developer activates the gear-labelled Configuration action
- **THEN** `/configuration` opens with checkout mapping, notification, `Reconcile all PRs`, and `Reconcile installation` controls while appearance remains only in the avatar menu and the dashboard contains no duplicate configuration section

#### Scenario: Avatar data is safe to render
- **WHEN** the signed-in identity has a validated HTTPS GitHub avatar URL
- **THEN** the snapshot exposes only that user's avatar and the navbar renders it through an escaped image URL

#### Scenario: Avatar data is absent or invalid
- **WHEN** the signed-in identity has no acceptable avatar URL
- **THEN** the navbar renders a safe non-network fallback without exposing another user's identity or raw provider data

#### Scenario: Local demo renders avatar navigation
- **WHEN** local fixture mode seeds its fictional signed-in developer
- **THEN** it uses a committed same-origin fictional avatar image so the avatar layout and dropdown behavior can be exercised without a network request or real user's image

#### Scenario: Configuration state has an error
- **WHEN** a checkout permission, repository resolution, notification permission, or reconciliation operation cannot proceed
- **THEN** the configuration page exposes an accessible explicit state and sanitized next action

### Requirement: Authenticated on-demand reconciliation
The dashboard SHALL let a signed-in developer trigger `Reconcile PR` for one authorized projected pull request, `Reconcile all PRs` for every currently known authorized open pull request, and `Reconcile installation` for approved installations bound to that user. The all-PR operation SHALL disclose its known PR count and estimated request volume before confirmation. Installation reconciliation SHALL perform broad repository, PR, deployment, OpenSpec, and repository-policy repair. All controls SHALL share reconciliation concurrency guards and expose running, success, partial-failure, and sanitized failure states.

#### Scenario: Reconciliation starts
- **WHEN** an authenticated developer activates an authorized reconciliation control and no overlapping work is active
- **THEN** the control exposes a running state and starts only its selected PR, known-PR, or installation scope

#### Scenario: Developer reconciles one pull request
- **WHEN** an authenticated developer activates `Reconcile PR` and the PR is authorized and open
- **THEN** the system reconciles only that repository and PR without listing the installation or changing another PR

#### Scenario: Developer reconciles all known pull requests
- **WHEN** an authenticated developer confirms `Reconcile all PRs`
- **THEN** the system reconciles every currently known authorized open pull request using the same targeted operation and does not discover missing PRs

#### Scenario: Developer reconciles an installation
- **WHEN** an authenticated developer confirms `Reconcile installation`
- **THEN** the system broadly repairs only that user's approved installations and refreshes cached repository policy along with repository, PR, deployment, and OpenSpec projections

#### Scenario: Reconciliation is already running
- **WHEN** another webhook, manual, or scheduled reconciliation overlaps the request
- **THEN** the system coalesces or serializes the work and starts no duplicate provider operation for the same installation and PR

#### Scenario: Reconciliation succeeds
- **WHEN** every selected target reconciles successfully
- **THEN** the control reports success and refreshes the signed-in user's dashboard projection

#### Scenario: Reconciliation fails
- **WHEN** any selected reconciliation fails
- **THEN** the control reports sanitized per-operation success or failure without exposing credentials, raw provider payloads, or unrelated installation state; a failed one-PR control remains visibly retryable with an accessible failure status

### Requirement: Post-commit dashboard invalidation
After a successful persisted user-visible Command Deck change, the system SHALL emit one post-commit invalidation to every affected connected user through the existing single-process in-memory stream boundary. The browser SHALL refetch `/api/snapshot`, including deletions, without polling. Cross-instance transport is deferred.

#### Scenario: Persisted projection change refreshes a connected dashboard
- **WHEN** webhook, targeted, scheduled, OAuth, bootstrap, explicit repair, or manual reconciliation persists a user-visible projection change
- **THEN** each affected connected user receives one post-commit invalidation and refetches `/api/snapshot`

#### Scenario: Persisted deletion disappears without manual reload
- **WHEN** a successful persisted mutation removes a visible pull request
- **THEN** the affected connected dashboard refetches its snapshot and no longer shows that pull request without manual reload or polling

#### Scenario: Startup broad repair refreshes affected users
- **WHEN** the readiness-independent startup broad repair persists a missed open or close
- **THEN** each affected connected user receives one post-commit invalidation without making readiness depend on the repair

#### Scenario: OAuth or installation repair refreshes affected users
- **WHEN** OAuth binding, installation bootstrap, or explicit installation repair persists user-visible data
- **THEN** only affected connected users receive one post-commit invalidation per completed mutation or batch
