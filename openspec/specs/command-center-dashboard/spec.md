# command-center-dashboard Specification

## Purpose
TBD - created by archiving change build-developer-command-center-mvp. Update Purpose after archive.
## Requirements
### Requirement: Personal operational summary
The system SHALL present every authorized open pull request authored by the signed-in developer with title, PR number, projected Draft → Ready for review → Mergeable lifecycle pills in a native `fieldset` with a `PR Lifecycle` legend that interrupts its top border, attention classification, accessible detail for Actions/check/formal-review/automated-review/mergeability evidence, branch/SHA-linked OpenSpec status, and recent GitHub deployment projections, from local installation-scoped projections. The pills SHALL show exactly one current stage using draft-first, then mergeable, then ready-for-review precedence, and SHALL reflect current projected evidence even when that moves a pull request backward. Completed pills SHALL display a green check and `Complete`; the current pill SHALL display a blue half-moon (`◐`) and `Current`; upcoming pills SHALL display a slate open circle (`○`) and `Upcoming`. A PR card SHALL show no default positive-status pills and SHALL show at most one actionable warning pill on a separate row below the lifecycle frame when attention is required. Pull requests requiring attention SHALL appear before healthy pull requests.

#### Scenario: Developer opens the command center
- **WHEN** a signed-in developer has projected state across one or more bound GitHub installations
- **THEN** the dashboard renders every open pull request authored by that developer within those installations without first polling provider list endpoints

#### Scenario: Pull request needs attention
- **WHEN** an authored open pull request is a draft, has requested changes, failed checks or Actions workflow, a conflicting or unmergeable state, or a linked incomplete OpenSpec
- **THEN** the dashboard shows its linked title and PR number, current lifecycle stage, and at most one actionable warning pill before healthy pull requests, while retaining exact blockers and all other known status evidence in its status detail

#### Scenario: Automated reviewer progress is known
- **WHEN** a configured bot-review signal has been projected for the pull request
- **THEN** the PR status detail shows the reviewer identity and whether its review is in progress or complete separately from the formal review decision

#### Scenario: Pull request is healthy
- **WHEN** an authored open pull request has no projected attention condition
- **THEN** the dashboard includes it with its current lifecycle stage, no warning pill, and no positive-status pills after pull requests requiring attention

#### Scenario: Pull request moves backward in the lifecycle
- **WHEN** a pull request previously displayed as Mergeable receives projected evidence that no longer satisfies that stage
- **THEN** the dashboard displays its current earlier lifecycle stage and applicable warning without implying irreversible progress

#### Scenario: Pull request has a linked unfinished OpenSpec group
- **WHEN** an OpenSpec is correlated to the pull request by commit or unique branch
- **THEN** the PR card shows its progress, complete current unfinished group as disabled checked and unchecked source-state checkboxes, and source action rather than a separate OpenSpec dashboard card

#### Scenario: Same pull request is projected through multiple installations
- **WHEN** authorized installation snapshots contain the same GitHub pull request identity
- **THEN** the dashboard shows one current pull-request card

#### Scenario: Developer has no authored open pull requests
- **WHEN** the signed-in developer has no authorized open pull requests
- **THEN** the dashboard states that there are no open pull requests authored by that developer rather than claiming all projected work is healthy

#### Scenario: Recent deployments have mixed outcomes
- **WHEN** GitHub deployment projections were updated within the last 48 hours
- **THEN** the header shows the newest deployment as a full detail-style row whose present repository, environment, ref, and SHA segments have single separators, and its shared sticky detail shows the newest five rows with state and available links first plus a `More deployments` disclosure for older rows

#### Scenario: No Railway runtime access
- **WHEN** the dashboard renders deployment state
- **THEN** it does not require Railway connection mappings, Railway API credentials, or Railway webhook verification state

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
