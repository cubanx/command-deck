## MODIFIED Requirements

### Requirement: Persisted pull-request ordering
The dashboard SHALL offer Closest to merge, Codex activity, Recently updated, PR number, OpenSpec progress, and Repository sort modes with an explicit direction, SHALL default safely to Closest to merge with fewest blockers first, and SHALL persist only the allowlisted mode and direction in the authenticated user dashboard preferences. Search, status, Actions, Checks, and repository controls SHALL filter before sorting.

#### Scenario: Closest-to-merge ordering is calculated
- **WHEN** pull requests have draft, requested-changes review, failed Actions, failed Checks, blocked mergeability, or linked incomplete OpenSpec state
- **THEN** each unresolved category contributes exactly one named blocker, cards show the blocker count and exact blockers, and the default order is blocker count ascending, valid OpenSpec progress descending, then pull-request number ascending

#### Scenario: Sort preference is restored
- **WHEN** a developer reloads after selecting a supported sort mode and direction
- **THEN** the user preference is restored from server persistence across reloads and devices

#### Scenario: Stored sort preference is invalid
- **WHEN** the preference is absent, invalid, unavailable, or contains an obsolete mode or direction
- **THEN** ordering falls back to Closest to merge with fewest blockers first and shows a sanitized save/load error when applicable without breaking the dashboard

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

### Requirement: Authenticated avatar navigation and one configuration page
The dashboard SHALL make its combined brand mark and Command center hero one accessible home link and place the signed-in developer's validated GitHub avatar at the right edge of the navbar. Activating the avatar SHALL open a compact native accessible dropdown containing vertical System, Light, and Dark appearance menu choices, a checkmark on the active choice, and a gear-labelled Configuration link styled as a menu row. Configuration SHALL open a dedicated `/configuration` page that owns local checkout mappings and overrides, repository resolution states, user-scoped reconciliation. Appearance SHALL remain only in the avatar menu. The dashboard header and body SHALL NOT retain Connect local checkout, Enable notifications, or an inline configuration section.

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
- **THEN** `/configuration` opens with checkout mapping and Reconcile now controls while appearance remains only in the avatar menu and the dashboard contains no duplicate configuration controls

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
- **WHEN** a checkout permission, repository resolution or reconciliation operation cannot proceed
- **THEN** the configuration page exposes an accessible explicit state and sanitized next action

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
- **THEN** the same dashboard renders representative pull-request, deploy, and associated OpenSpec states without contacting a provider

## ADDED Requirements

### Requirement: Persistent user dashboard preferences
The system SHALL persist selected stable repository IDs, sort, and supported dashboard filter selections under the authenticated user's preferences.ui.dashboard. Absent values SHALL use documented existing defaults. Preference writes SHALL validate supported values and update only supplied fields; ingestion SHALL NOT change preferences. Directory handles and local filesystem data SHALL remain browser-local.

#### Scenario: Reload or second device
- **WHEN** a user saves repository selection and ordering then signs in elsewhere
- **THEN** their saved dashboard preferences are restored.

#### Scenario: Concurrent preference and ingestion writes
- **WHEN** a PR event is processed while the user changes a preference
- **THEN** both changes survive without one replacing the other.

#### Scenario: Unauthorized repository preference
- **WHEN** a stored selection refers to a repository no longer authorized
- **THEN** the dashboard excludes that repository without granting access.

### Requirement: Narrow domain dashboard reads
Authentication SHALL retrieve only session and required identity fields. Dashboard reads SHALL select authorized domain records without embedding activity in users or polling GitHub. Existing personal author filtering SHALL remain a display rule, and merged PRs with outstanding obligations SHALL remain visible in their appropriate lifecycle state.

#### Scenario: Many unrelated records exist
- **WHEN** a user requests the dashboard
- **THEN** reads are restricted to their authorized scope and requested card data.

#### Scenario: New projected state
- **WHEN** a webhook successfully updates a visible PR
- **THEN** authorized connected clients receive a refresh and can retrieve the new state without a manual browser reload.
