## MODIFIED Requirements

### Requirement: Personal operational summary
The system SHALL present every authorized open pull request authored by the signed-in developer with title, PR number, a projected Draft → Ready for review → Mergeable lifecycle rail, attention classification, accessible detail for Actions/check/formal-review/automated-review/mergeability evidence, branch/SHA-linked OpenSpec status, and recent GitHub deployment projections, from local installation-scoped projections. The rail SHALL show exactly one current stage using mergeable-first, then draft, then ready-for-review precedence, and SHALL reflect current projected evidence even when that moves a pull request backward. A PR card SHALL show no default positive-status pills and SHALL show at most one actionable warning pill when attention is required. Pull requests requiring attention SHALL appear before healthy pull requests.

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
- **THEN** the dashboard shows repository, environment, ref or SHA, state, and target link newest first and omits older deployments

#### Scenario: No Railway runtime access
- **WHEN** the dashboard renders deployment state
- **THEN** it does not require Railway connection mappings, Railway API credentials, or Railway webhook verification state

### Requirement: Crisp-sibling visual semantics
The dashboard SHALL use a compact neutral shell, bordered cards, responsive grids or scroll-contained tables, plain operational labels, visible focus styles, and consistent semantic status colors. PR cards SHALL represent lifecycle status with a compact rail and reserve card-level status pills for a single actionable attention condition rather than default positive states.

#### Scenario: Narrow viewport
- **WHEN** the app is viewed in a narrow installed window
- **THEN** cards stack, tables remain horizontally accessible, and lifecycle status and actions remain readable

#### Scenario: Healthy PR status is presented
- **WHEN** a pull request has no attention condition
- **THEN** its lifecycle rail communicates the current state without a green or other positive-status pill

## ADDED Requirements

### Requirement: Accessible pull request status detail
The system SHALL provide one shared status-detail interaction for each PR lifecycle rail or warning pill that exposes the projected Actions, checks, formal review, automated review, mergeability, exact blockers, failed-workflow links, branch/SHA, freshness, and linked OpenSpec context without making a GitHub request.

#### Scenario: Pointer user inspects PR status
- **WHEN** a pointer user hovers the lifecycle rail or warning pill
- **THEN** the dashboard presents the PR's projected status detail

#### Scenario: Keyboard or touch user inspects PR status
- **WHEN** a keyboard user focuses, or a touch user activates, the lifecycle rail or warning pill
- **THEN** the dashboard presents the same status detail and allows it to remain available while its links are used

#### Scenario: Status detail is dismissed
- **WHEN** a user dismisses the status detail with Escape, outside interaction, or its trigger
- **THEN** the detail closes and keyboard focus remains usable on the originating PR card

### Requirement: Lifecycle stage and attention filters
The dashboard SHALL filter PR cards by the mutually exclusive Draft, Ready for review, and Mergeable lifecycle stages, and SHALL provide attention/blocker filtering separately from those stages.

#### Scenario: Developer filters by lifecycle stage
- **WHEN** a developer selects a lifecycle stage filter
- **THEN** the dashboard shows only PR cards whose current projected lifecycle stage matches that selection

#### Scenario: Developer filters by attention
- **WHEN** a developer enables the attention filter
- **THEN** the dashboard shows PR cards with projected attention conditions regardless of their lifecycle stage
