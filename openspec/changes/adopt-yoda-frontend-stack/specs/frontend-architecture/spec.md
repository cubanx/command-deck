## Purpose

Defines the browser boundary that preserves Command Center behavior while moving rendering, data refresh, and interaction state into an accessible component-owned frontend.

## ADDED Requirements

### Requirement: Component-owned dashboard preserves operational behavior
The browser application SHALL render the authenticated dashboard and configuration surfaces through a component-owned UI while preserving the existing lifecycle, filtering, search, repository selection, ordering, status detail, deployment detail, reconciliation, appearance, and merge-control behavior defined by the canonical capabilities.

#### Scenario: Developer opens the migrated dashboard
- **WHEN** an authenticated developer opens the application with projected pull requests and deployments
- **THEN** the application presents the filtered pull-request count as vertically centered muted `<N> results` status text immediately after Clear filters in the wrapping filter row, followed by the bordered PR Lifecycle wizard with Complete, Current, and Upcoming stage pills, attention states, and available actions without duplicating signed-in identity or explanatory brand copy in the dashboard surface

#### Scenario: Developer preferences survive a refresh
- **WHEN** an event-driven snapshot refresh occurs after the developer changes filters or ordering
- **THEN** the selected filters, ordering, appearance, and applicable interaction state remain in effect

#### Scenario: Developer filters repositories and statuses
- **WHEN** a developer uses the dashboard filter bar
- **THEN** visible repository pills toggle each repository with one action, selected repository pills display a checkmark with visual separation from the repository name without changing their accessible names, the Search field remains compact on wide screens and full-width when the filter row stacks, one semantic Sort pull requests dropdown combines mode and direction, and one multi-select Status dropdown provides the eight lifecycle and attention filters with an All checkbox that is checked for eight selections, indeterminate for partial selection, and unchecked for none

#### Scenario: Developer selects no statuses
- **WHEN** the developer clears every status in the Status dropdown
- **THEN** the dashboard labels the selection `Status: None` and renders no pull requests until a status or All is selected

#### Scenario: Multiple OpenSpecs are associated with a pull request
- **WHEN** the authoritative snapshot correlates multiple committed OpenSpecs to one pull request
- **THEN** the application presents every correlated OpenSpec and derives lifecycle attention from their authoritative ordered state

### Requirement: Authoritative and browser-local evidence remain separate
The browser application MUST derive lifecycle, attention, merge availability, and pull-request-owned OpenSpec associations only from authenticated server projections. Browser-local checkout discovery SHALL remain an explicitly local informational and configuration surface and MUST NOT promote detected evidence into authoritative pull-request state.

#### Scenario: Local checkout detects an undeclared OpenSpec
- **WHEN** a configured browser checkout detects an OpenSpec that the authenticated snapshot does not authoritatively associate with the pull request
- **THEN** the application labels the evidence as local or detected and does not change lifecycle, attention, merge availability, or authoritative association state

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

#### Scenario: Developer reviews deployment evidence
- **WHEN** an authenticated developer opens either the dashboard or Configuration
- **THEN** compact deployment evidence and its accessible detail are centered in the shared application header without becoming route-specific content

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
