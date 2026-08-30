## Purpose

Defines the browser boundary that preserves Command Center behavior while moving rendering, data refresh, and interaction state into an accessible component-owned frontend.

## ADDED Requirements

### Requirement: Component-owned dashboard preserves operational behavior
The browser application SHALL render the authenticated dashboard and configuration surfaces through a component-owned UI while preserving the existing lifecycle, filtering, search, repository selection, ordering, status detail, deployment detail, reconciliation, appearance, and merge-control behavior defined by the canonical capabilities.

#### Scenario: Developer opens the migrated dashboard
- **WHEN** an authenticated developer opens the application with projected pull requests and deployments
- **THEN** the application presents the filtered pull-request count as right-aligned muted `<N> results` status text immediately after Clear filters and vertically aligned with the filter controls in the wrapping filter row, followed by the bordered PR Lifecycle wizard with Complete, Current, and Upcoming stage pills, attention states, and available actions without duplicating signed-in identity or explanatory brand copy in the dashboard surface

#### Scenario: Developer preferences survive a refresh
- **WHEN** an event-driven snapshot refresh occurs after the developer changes filters or ordering
- **THEN** the selected filters, ordering, appearance, and applicable interaction state remain in effect

#### Scenario: Developer filters repositories and statuses
- **WHEN** a developer uses the dashboard filter bar
- **THEN** visible repository pills toggle each repository with one action, selected repository pills display a checkmark with visual separation from the repository name without changing their accessible names, the Search field remains compact on wide screens and full-width when the filter row stacks, one semantic Sort pull requests dropdown combines mode and direction, and one stock clearable MultiSelect labeled `Status` provides eight flat lifecycle and attention options with built-in pills

#### Scenario: Developer clears status filters
- **WHEN** the developer uses the MultiSelect clear affordance or Clear filters
- **THEN** the Status control displays its empty `All statuses` placeholder while the existing filter state includes all five lifecycle stages and three attention predicates

#### Scenario: Multiple OpenSpecs are associated with a pull request
- **WHEN** the authoritative snapshot correlates multiple committed OpenSpecs to one pull request
- **THEN** the application presents every correlated OpenSpec and derives lifecycle attention from their authoritative ordered state

#### Scenario: Developer views authoritative OpenSpec work
- **WHEN** the developer expands an authoritative OpenSpec on a pull-request card
- **THEN** a bordered disclosure with pointer, hover, and keyboard-focus affordances presents the current group in its emphasized summary and reveals the current incomplete non-post-merge task group plus the next later incomplete non-post-merge group, in source order with task completion state and a safe tasks-source link, or reports that all tasks are complete when no such group remains

#### Scenario: Incomplete legacy evidence lacks task groups
- **WHEN** an authoritative OpenSpec reports fewer completed tasks than its total but its persisted evidence has no projected task groups
- **THEN** the disclosure labels the OpenSpec incomplete, explains that task details are unavailable until reconciliation, retains the safe tasks-source link, and does not claim that all tasks are complete

#### Scenario: Remaining OpenSpec work is post-merge
- **WHEN** every unchecked task in an authoritative OpenSpec belongs to a post-merge group
- **THEN** the disclosure summary presents a compact `Post-merge` pill beside the OpenSpec name and progress, presents that incomplete group and its task completion state when expanded, and allows lifecycle and merge readiness to continue ignoring post-merge work

#### Scenario: Narrow pull-request cards preserve blocker and post-merge presentation

- **WHEN** a pull-request card renders at a narrow viewport with multiple next-stage blockers and post-merge OpenSpec work
- **THEN** blocker bullets and wrapped text remain contained within the card, and the `Post-merge` pill has visible inline separation and vertical alignment without changing the native disclosure control

#### Scenario: Pull-request reconciliation stays compact and direct

- **WHEN** an operator views a pull-request card
- **THEN** the card header presents the existing `Reconcile PR` action beside lifecycle status, preserves its busy, announcement, error, and focus behavior, omits the redundant status-detail action and dialog, and does not reserve a footer row when no merge action is available

#### Scenario: Pull-request actions use a compact title menu

- **WHEN** an operator views a pull-request card
- **THEN** the header omits the redundant stage pill and direct title link, and the pull-request title itself is one large accessible dropdown trigger with a visible disclosure cue
- **AND** its menu orders the existing `Reconcile PR` action, conditionally provides the existing native merge form only when exact-head merge control is enabled, and finishes with a safe `Open PR` new-window link and icon, preserving busy, announcement, failure, focus, and merge-target safety behavior
- **AND** clicking anywhere on the title control opens the menu while its chevron remains vertically centered as a fixed cue beside single-line or wrapped title text
- **AND** the dropdown's right edge anchors beneath the title control's chevron rather than centering beneath its full width

### Requirement: Authoritative and browser-local evidence remain separate
The browser application MUST derive lifecycle, attention, merge availability, and pull-request-owned OpenSpec associations only from authenticated server projections. Browser-local checkout discovery SHALL remain an explicitly local informational and configuration surface and MUST NOT promote detected evidence into authoritative pull-request state.

#### Scenario: Local checkout detects an undeclared OpenSpec
- **WHEN** a configured browser checkout detects an OpenSpec that the authenticated snapshot does not authoritatively associate with the pull request
- **THEN** the application labels the evidence as local or detected, does not render it as an authoritative expandable task view, and does not change lifecycle, attention, merge availability, or authoritative association state

#### Scenario: Detected evidence repeats an authoritative association
- **WHEN** a detected OpenSpec candidate has the same normalized change name as an authoritative OpenSpec already presented for the pull request
- **THEN** the application suppresses only the duplicate informational label while retaining the authoritative disclosure and any other detected candidates

#### Scenario: Authoritative projection changes after reconciliation
- **WHEN** reconciliation or a later snapshot authoritatively associates the OpenSpec
- **THEN** the application updates the pull request from the server projection without treating the prior browser-local evidence as its source of truth

### Requirement: Snapshot freshness remains event driven
The browser application SHALL load the authenticated snapshot through one cacheable data boundary and SHALL translate the existing authenticated server-sent refresh event into invalidation of that snapshot. It MUST NOT add background polling while the event stream is healthy.

#### Scenario: Server emits a refresh event
- **WHEN** the authenticated event stream announces that projected state changed
- **THEN** the application invalidates and refetches the snapshot once and renders the updated state

#### Scenario: Event stream reconnects
- **WHEN** the browser reconnects the event stream after a transient interruption
- **THEN** the application refreshes authoritative snapshot state without duplicating user-visible records or losing local preferences

### Requirement: Interactive surfaces remain accessible
The migrated application SHALL retain semantic names, focus indicators, keyboard operation, focus return, dismissible detail behavior, status announcements, and narrow-viewport behavior required by the dashboard and merge capabilities.

#### Scenario: Keyboard user inspects and dismisses status detail
- **WHEN** a keyboard user opens pull-request or deployment detail and dismisses it
- **THEN** focus moves into the detail when appropriate and returns to the invoking control after dismissal

#### Scenario: Action result is announced
- **WHEN** reconciliation or merge confirmation succeeds or fails
- **THEN** the sanitized outcome is exposed through an appropriate accessible status or alert region and the relevant authoritative data is refreshed

#### Scenario: Developer manages operational configuration
- **WHEN** an authenticated developer opens Configuration
- **THEN** installation and pull-request reconciliation, checkout mapping results, appearance, and notification permission are presented as accessible configuration controls with announced outcomes

#### Scenario: Developer acts on one pull request
- **WHEN** an authenticated developer reviews a dashboard pull-request card
- **THEN** the card offers read-only Status details and PR-scoped reconciliation without duplicating installation reconciliation that is owned by Configuration

#### Scenario: Developer reviews deployment evidence
- **WHEN** an authenticated developer opens either the dashboard or Configuration
- **THEN** compact deployment evidence and its accessible detail are centered in the shared application header without becoming route-specific content

#### Scenario: Developer reads the latest deployment summary
- **WHEN** the shared header has latest deployment evidence
- **THEN** its existing deployment-detail trigger presents `Latest deployment` and the optional status on a first row, with the deployment detail spanning the second row while retaining its accessible name, dialog, and focus return behavior

#### Scenario: Responsive header keeps deployment centered
- **WHEN** the header has room for its brand, deployment trigger, and avatar at a narrow viewport
- **THEN** it keeps them in one flex-wrapping row with equal flexible brand and avatar rails around the auto-width deployment trigger, and lets ordinary wrapping handle later collisions without forcing the brand to a separate row

#### Scenario: Developer opens avatar navigation
- **WHEN** an authenticated developer opens the avatar menu
- **THEN** an unboxed avatar target, visible side-by-side dropdown affordance, and PR-wide reconciliation shortcut are available alongside Configuration navigation while retaining keyboard focus visibility

#### Scenario: Developer identifies the application
- **WHEN** the shared navigation header renders
- **THEN** the existing application icon remains unchanged while the larger brand text is vertically centered beside it without shifting the independently centered deployment summary

### Requirement: Mutating controls remain fail closed
The migrated application SHALL preserve authenticated reconciliation and exact-head merge flows, and SHALL render a mutating control only when the corresponding current server-projected permission and lifecycle prerequisites are satisfied. Server-side action-time checks remain authoritative.

#### Scenario: Pull request is not lifecycle ready
- **WHEN** a pull request is blocked by OpenSpec progress, review state, unresolved threads, repository policy, required checks, draft state, or mergeability
- **THEN** the application does not render an enabled Merge control even if the installation can write repository contents

#### Scenario: State changes before confirmation
- **WHEN** pull-request state changes after a merge control was rendered but before confirmation
- **THEN** the server re-evaluates exact-head eligibility, refuses an ineligible merge, and the application refreshes the sanitized current state

### Requirement: Existing shell and endpoint contracts remain compatible
The migration SHALL preserve the installable application shell, authenticated snapshot and event endpoints, reconciliation and merge routes, OAuth and webhook routes, service-worker behavior, and provider projection boundaries until a separately governed change replaces them.

#### Scenario: Installed application receives the migrated frontend
- **WHEN** a developer opens an installed or browser-hosted application shell after the migration
- **THEN** the shell loads the migrated frontend while retaining manifest, icon, service-worker, authentication, and safe-delivery behavior

#### Scenario: Existing server integration tests run
- **WHEN** the migrated browser bundle is served through the current application server
- **THEN** existing authenticated API, event, OAuth, webhook, reconciliation, and merge routes retain their established request and response contracts
