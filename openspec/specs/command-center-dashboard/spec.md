# command-center-dashboard Specification

## Purpose
TBD - created by archiving change build-developer-command-center-mvp. Update Purpose after archive.

## Requirements

### Requirement: Personal operational summary
The system SHALL present every authorized open pull request authored by the signed-in developer with title, PR number, draft state, attention classification, distinct Actions/check/formal-review/automated-review/mergeability evidence, a conditional guarded Merge control beside the linked title, and branch/SHA-linked OpenSpec status, plus recent authoritative GitHub deployment projections, from local installation-scoped projections. The default pull-request order SHALL be Closest to merge using the visible deterministic unresolved-gate count, followed by OpenSpec progress and pull-request number ascending.

#### Scenario: Developer opens the command center
- **WHEN** a signed-in developer has projected state across one or more bound GitHub installations
- **THEN** the dashboard renders every open pull request authored by that developer within those installations without first polling provider list endpoints

#### Scenario: Pull request needs attention
- **WHEN** an authored open pull request is a draft, has requested changes, failed checks or Actions workflow, a conflicting or unmergeable state, or a linked incomplete OpenSpec
- **THEN** the dashboard shows its linked title and PR number, draft/ready state, attention state, Actions status, all other known status fields, and nested OpenSpec evidence in its authoritative status bucket

#### Scenario: Automated reviewer progress is known
- **WHEN** a configured bot-review signal has been projected for the pull request
- **THEN** the PR card shows the reviewer identity and whether its review is in progress or complete separately from the formal review decision

#### Scenario: Pull request is healthy
- **WHEN** an authored open pull request has no projected attention condition
- **THEN** the dashboard includes it with a clear healthy state in its authoritative status bucket

#### Scenario: Pull request moves backward in the lifecycle
- **WHEN** a pull request previously displayed as Mergeable receives projected evidence that no longer satisfies that stage
- **THEN** the dashboard displays its current earlier lifecycle stage and applicable warning without implying irreversible progress

#### Scenario: GitHub Actions workflow fails
- **WHEN** a signed `workflow_run` projection reports one or more failed workflows with authoritative names and GitHub run URLs
- **THEN** the PR card shows each failed workflow name linked to its run while preserving the separate Checks aggregate

#### Scenario: Pull request has a linked unfinished OpenSpec group
- **WHEN** an OpenSpec is correlated to the pull request by repository identity and exact commit or unique branch
- **THEN** the PR card shows a collapsed native disclosure whose summary contains the change name, total progress, current unfinished group, and existing Open tasks link
- **AND** expanding the disclosure shows that current group's disabled checked and unchecked source-state checklist

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
- **THEN** the dashboard shows repository, environment, ref or SHA, latest state, and target link newest first and omits older deployments

#### Scenario: No Railway runtime access
- **WHEN** the dashboard renders deployment state
- **THEN** it does not require Railway connection mappings, Railway API credentials, or Railway webhook verification state

#### Scenario: Pull request merge permission is unavailable
- **WHEN** a pull-request card is not currently eligible for the guarded merge action
- **THEN** the card renders no Merge action while retaining its mergeability pill and blocker evidence

### Requirement: Crisp-sibling visual semantics
The dashboard SHALL use a compact neutral shell, bordered cards, responsive grids or scroll-contained tables, plain operational labels, visible focus styles, and consistent semantic status colors. PR cards SHALL represent lifecycle status with three compact pills and reserve card-level status pills for a single actionable attention condition rather than default positive states.

#### Scenario: Narrow viewport
- **WHEN** the app is viewed in a narrow installed window
- **THEN** cards stack, tables remain horizontally accessible, and lifecycle status and actions remain readable

#### Scenario: Healthy PR status is presented
- **WHEN** a pull request has no attention condition
- **THEN** its lifecycle pills communicate the current state without a green or other positive-status pill

#### Scenario: Current lifecycle stage is scanned
- **WHEN** a developer scans a pull-request lifecycle pill group
- **THEN** the current stage is visually and programmatically distinguishable from the other stages with sufficient light and dark theme contrast

#### Scenario: Lifecycle frame is scanned
- **WHEN** a developer scans a pull-request card at normal width
- **THEN** the native `PR Lifecycle` fieldset legend interrupts its top border above its three horizontal pills, wraps those pills only when width requires it, and gives its warning, if any, a separate spaced row below

#### Scenario: Developer configures local checkouts
- **WHEN** a developer opens Configuration with authorized repositories
- **THEN** the app presents accessible Unresolved and Resolved tables in that order, each sorted case-insensitively by full repository name, while retaining organization-root and per-repository checkout controls

### Requirement: Explicit focus states
The dashboard SHALL distinguish loading, signed-out, no-installation, empty, stale, and error states with concise next actions.

#### Scenario: Signed-in developer has no installation
- **WHEN** a developer has authenticated but bound no GitHub App installation
- **THEN** the dashboard explains that no repositories are connected and provides the installation action

#### Scenario: Projection is empty
- **WHEN** a bound developer has no open pull requests or OpenSpecs
- **THEN** the dashboard shows a calm explicit empty state rather than an ambiguous blank region

#### Scenario: Local developer opens the seeded dashboard
- **WHEN** the command center is running through the standard development command
- **THEN** the same dashboard renders representative pull-request, deploy, OpenSpec, and notification states without contacting a provider

### Requirement: Accessible pull request status detail
The system SHALL provide one shared status-detail interaction for each PR warning/problem pill or title link that exposes the projected Actions, checks, formal review, automated review, mergeability, exact blockers, failed-workflow links, branch/SHA, freshness, and linked OpenSpec context without making a GitHub request. Lifecycle pills SHALL remain visual only.

#### Scenario: Pointer user inspects PR status
- **WHEN** a pointer user hovers a warning/problem pill or title link
- **THEN** the dashboard presents the PR's projected status detail near the trigger after a brief delay

#### Scenario: Pointer leaves PR status
- **WHEN** a pointer user leaves a hover-opened warning/problem pill or title link without pinning the detail
- **THEN** the dashboard keeps the projected status detail open until the user explicitly dismisses it or inspects another warning/problem pill or title link

#### Scenario: Keyboard or touch user inspects PR status
- **WHEN** a keyboard user focuses, or a touch user activates, a warning/problem pill or title link
- **THEN** the dashboard presents the same status detail and allows it to remain available while its links are used

#### Scenario: Title link previews PR status
- **WHEN** a pointer hovers or a keyboard user focuses a PR title link
- **THEN** the dashboard opens the same shared status detail, and activating the link still navigates to GitHub

#### Scenario: Status detail is dismissed
- **WHEN** a user dismisses the status detail with Escape, outside interaction, or its trigger
- **THEN** the detail closes and keyboard focus remains usable on the originating PR card

### Requirement: Accessible deployment detail
The system SHALL present the newest existing 48-hour deployment projection as a full detail-style header row beside the Command Center brand. It SHALL join only present repository, environment, ref, and SHA segments, and reuse the shared status-detail interaction to show the newest five existing deployment rows by default plus a native `More deployments` disclosure for remaining rows and their links, without a provider request, dependency, or large dashboard side card.

#### Scenario: Developer inspects recent deployments
- **WHEN** a user hovers the header trigger after the short delay, focuses it, or clicks/taps it
- **THEN** the sticky detail shows the existing newest-first 48-hour deployment projections and their available target or log links until dismissed or replaced

### Requirement: Lifecycle stage and attention filters
The dashboard SHALL filter PR cards by the mutually exclusive Draft, Ready for review, and Mergeable lifecycle stages, and SHALL provide attention/blocker filtering separately from those stages.

#### Scenario: Developer filters by lifecycle stage
- **WHEN** a developer selects a lifecycle stage filter
- **THEN** the dashboard shows only PR cards whose current projected lifecycle stage matches that selection

#### Scenario: Developer filters by attention
- **WHEN** a developer enables the attention filter
- **THEN** the dashboard shows PR cards with projected attention conditions regardless of their lifecycle stage

### Requirement: Sticky pull-request controls
The dashboard SHALL keep a compact controls bar visible while scrolling the pull-request list, SHALL use native accessible controls with labeled focus order and keyboard operation, and SHALL remain usable when controls wrap on narrow screens. The bar SHALL contain fuzzy search, status filters, repository filtering, a sort-mode selector, a direction control, the final visible result count, and one Clear action for all search and filter state. It SHALL organize those controls into stable semantic groups for search and results, filtering, and sorting rather than one interleaved wrapping stream.

#### Scenario: Developer scrolls or narrows the pull-request list
- **WHEN** the pull-request list extends beyond the viewport or the viewport is narrow
- **THEN** the controls remain sticky, readable, keyboard reachable, and usable without obscuring the pull-request content or separating labels from their controls

#### Scenario: Pull-request controls are presented
- **WHEN** the controls bar renders
- **THEN** search, result count, and Clear form one group; status, failure, and repository filters form one group; and sort mode, direction, and its availability explanation form one group in the same logical focus order

#### Scenario: Developer combines controls
- **WHEN** search, status, and repository filters are active together
- **THEN** the visible result count reflects the final intersection and Clear resets every search and filter control

### Requirement: Dependency-free fuzzy pull-request search
The dashboard SHALL filter immediately as the developer types using a small dependency-free matcher over PR title, owner/repository, branch, and linked OpenSpec change name. Exact, prefix, and substring matches SHALL rank before typo-tolerant matches, while a PR-number query SHALL match only that exact number.

#### Scenario: Developer searches pull-request evidence
- **WHEN** a query matches a title, owner/repository, branch, or linked OpenSpec change name
- **THEN** matching cards enter the eligible result set and the selected pull-request sort orders that set deterministically

#### Scenario: Developer searches by pull-request number
- **WHEN** the query is numeric
- **THEN** only the pull request with that exact number matches

#### Scenario: Developer uses search shortcuts
- **WHEN** the developer presses `/` outside an editable control or Escape while search is focused
- **THEN** `/` focuses search and Escape clears its current value

### Requirement: Exclusive pull-request status buckets
Every projected pull request SHALL belong to exactly one clickable status-filter bucket with this precedence: Mergeable for authoritative `mergeable=true` or clean state even when draft; Ready for review for every remaining non-draft; Draft for every remaining draft. These buckets, Actions, and Checks SHALL remain filters rather than redundant sort modes.

#### Scenario: Draft pull request is authoritatively mergeable
- **WHEN** a draft pull request has authoritative `mergeable=true` or clean state
- **THEN** it belongs only to the Mergeable filter bucket while the selected sort independently determines its position

#### Scenario: Status filters are selected
- **WHEN** the developer activates one or more status pills
- **THEN** only pull requests in those same mutually exclusive buckets remain visible

### Requirement: Searchable repository multi-select
The repository filter SHALL be a searchable multi-select dropdown that displays owner/repository names, permits more than one selection, and makes active selections apparent without rendering one pill per repository.

#### Scenario: Developer selects repositories
- **WHEN** the developer searches the repository dropdown and selects multiple owner/repository entries
- **THEN** pull requests from any selected repository remain eligible for the combined result set and the active filter state is evident

### Requirement: Persisted pull-request ordering
The dashboard SHALL offer Closest to merge, Codex activity, Recently updated, PR number, OpenSpec progress, and Repository sort modes with an explicit direction, SHALL default safely to Closest to merge with fewest blockers first, and SHALL persist only the allowlisted mode and direction browser-locally. Search, status, Actions, Checks, and repository controls SHALL filter before sorting.

#### Scenario: Closest-to-merge ordering is calculated
- **WHEN** pull requests have draft, requested-changes review, failed Actions, failed Checks, blocked mergeability, or linked incomplete OpenSpec state
- **THEN** each unresolved category contributes exactly one named blocker, cards show the blocker count and exact blockers, and the default order is blocker count ascending, valid OpenSpec progress descending, then pull-request number ascending

#### Scenario: Sort preference is restored
- **WHEN** a developer reloads after selecting a supported sort mode and direction
- **THEN** the browser-local preference is restored without server persistence or synchronization

#### Scenario: Stored sort preference is invalid
- **WHEN** storage is absent, corrupt, inaccessible, or contains an obsolete mode or direction
- **THEN** ordering falls back to Closest to merge with fewest blockers first and exposes no raw storage error

#### Scenario: Developer selects another available sort
- **WHEN** Recently updated, PR number, OpenSpec progress, or Repository is selected
- **THEN** the eligible cards use that mode and direction with unavailable values last and deterministic Closest-to-merge and pull-request-number fallback where identities can tie

#### Scenario: Codex activity data is unavailable
- **WHEN** the separate Codex-activity OpenSpec has not supplied valid browser-local ordering data
- **THEN** Codex activity is hidden or disabled with an accessible explanation and the dashboard does not fabricate, fetch, or infer activity order

#### Scenario: Codex activity data becomes available
- **WHEN** the separate Codex-activity contract supplies valid correlated ordering data
- **THEN** matched pull requests follow that order, unmatched pull requests follow matched pull requests, and ties or unmatched entries use Closest to merge then pull-request number ascending

#### Scenario: Developer clears filters
- **WHEN** the developer activates Clear
- **THEN** search and filter state reset while the persisted sort mode and direction remain selected

### Requirement: Pull-request section has an accessible non-visual name
The dashboard SHALL not show a visible pull-request section heading and SHALL preserve the section's accessible landmark name using the existing visually-hidden or ARIA convention.

#### Scenario: Assistive technology navigates the pull-request section
- **WHEN** the dashboard renders pull-request cards
- **THEN** the section has an accessible name without displaying a replacement heading

### Requirement: Authenticated avatar navigation and one configuration page
The dashboard SHALL make its combined brand mark and Command center hero one accessible home link and place the signed-in developer's validated GitHub avatar at the right edge of the navbar. Activating the avatar SHALL open a compact native accessible dropdown containing vertical System, Light, and Dark appearance menu choices, a checkmark on the active choice, and a gear-labelled Configuration link styled as a menu row. Configuration SHALL open a dedicated `/configuration` page that owns local checkout mappings and overrides, repository resolution states, existing notification permission configuration, and user-scoped reconciliation. Appearance SHALL remain only in the avatar menu. The dashboard header and body SHALL NOT retain Connect local checkout, Enable notifications, or an inline configuration section.

The navbar and combined brand SHALL remain on one non-wrapping row with the logo, title, and avatar top-aligned while the subtitle remains beneath the title.

#### Scenario: Developer activates the brand
- **WHEN** the developer activates the combined navbar logo and Command center hero
- **THEN** one native link with one tab stop navigates to `/`

#### Scenario: Navbar renders across widths
- **WHEN** the dashboard header renders at wide or narrow supported widths
- **THEN** the logo, Command center title, and avatar share one stable top alignment without wrapping the brand apart from its subtitle

#### Scenario: Signed-in developer opens the avatar menu
- **WHEN** the developer activates their navbar avatar with pointer or keyboard input
- **THEN** a labeled native disclosure exposes vertical System, Light, and Dark menu choices with only the current selection checked, followed by a gear-labelled Configuration action in predictable focus order

#### Scenario: Developer opens configuration
- **WHEN** the developer activates the gear-labelled Configuration action
- **THEN** `/configuration` opens with checkout mapping, notification, and Reconcile now controls while appearance remains only in the avatar menu and the dashboard contains no duplicate configuration controls

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
The configuration screen SHALL let a signed-in developer trigger immediate reconciliation only for approved installations bound to that user, SHALL reuse the existing installation reconciliation path, and SHALL serialize scheduled and manual reconciliation so duplicate concurrent triggers do not start parallel provider work.

#### Scenario: Reconciliation starts
- **WHEN** an authenticated developer activates Reconcile now and no reconciliation is running
- **THEN** the control exposes a running state and the existing reconciliation path processes only that user's bound approved installations

#### Scenario: Reconciliation is already running
- **WHEN** another manual or scheduled reconciliation overlaps the request
- **THEN** the control remains disabled and no duplicate provider reconciliation begins

#### Scenario: Reconciliation succeeds
- **WHEN** every selected installation reconciles successfully
- **THEN** the screen reports success and refreshes the signed-in user's dashboard projection

#### Scenario: Reconciliation fails
- **WHEN** any selected reconciliation fails
- **THEN** the screen reports a sanitized failure without exposing credentials or raw provider payloads

### Requirement: Expected signed-out snapshot load

The dashboard SHALL make one snapshot request per load. A `401` response SHALL render the signed-out state without a TanStack retry or application-error log; any other failed response or request failure SHALL retain TanStack Query's existing retry behavior, sanitized error classification, and visible recovery state.

#### Scenario: Snapshot request is unauthenticated

- **WHEN** the dashboard's snapshot request returns `401`
- **THEN** the dashboard renders its signed-out state without retrying the request or logging an application error

#### Scenario: Snapshot request fails for another reason

- **WHEN** the snapshot request fails or returns a non-success status other than `401`
- **THEN** TanStack Query retains its configured retries, and the dashboard logs only sanitized failure context and renders its existing recovery state without exposing response content
