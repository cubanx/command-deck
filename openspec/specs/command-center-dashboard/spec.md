# command-center-dashboard Specification

## Purpose
TBD - created by archiving change build-developer-command-center-mvp. Update Purpose after archive.
## Requirements
### Requirement: Personal operational summary
The system SHALL present every authorized open pull request authored by the signed-in developer with title, PR number, draft state, attention classification, Actions/check/formal-review/automated-review/mergeability evidence, and branch/SHA-linked OpenSpec status, plus recent GitHub deployment projections, from local installation-scoped projections. Pull requests requiring attention SHALL appear before healthy pull requests.

#### Scenario: Developer opens the command center
- **WHEN** a signed-in developer has projected state across one or more bound GitHub installations
- **THEN** the dashboard renders every open pull request authored by that developer within those installations without first polling provider list endpoints

#### Scenario: Pull request needs attention
- **WHEN** an authored open pull request is a draft, has requested changes, failed checks or Actions workflow, a conflicting or unmergeable state, or a linked incomplete OpenSpec
- **THEN** the dashboard shows its linked title and PR number, draft/ready state, attention state, Actions status, all other known status fields, and nested OpenSpec evidence before healthy pull requests

#### Scenario: Automated reviewer progress is known
- **WHEN** a configured bot-review signal has been projected for the pull request
- **THEN** the PR card shows the reviewer identity and whether its review is in progress or complete separately from the formal review decision

#### Scenario: Pull request is healthy
- **WHEN** an authored open pull request has no projected attention condition
- **THEN** the dashboard includes it with a clear healthy state after pull requests requiring attention

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
The dashboard SHALL use a compact neutral shell, bordered cards, responsive grids or scroll-contained tables, plain operational labels, visible focus styles, and consistent semantic status colors.

#### Scenario: Narrow viewport
- **WHEN** the app is viewed in a narrow installed window
- **THEN** cards stack, tables remain horizontally accessible, and primary status and actions remain readable

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
