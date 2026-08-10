## ADDED Requirements

### Requirement: Personal operational summary
The system SHALL present the signed-in developer's attention-required open pull requests with title, PR number, draft state, Actions/check/formal-review/automated-review/mergeability evidence, and branch/SHA-linked OpenSpec status, plus recent Railway deployment projections of every verification state, from local projections.

#### Scenario: Developer opens the command center
- **WHEN** a signed-in developer has projected state
- **THEN** the dashboard renders only that developer's bound data without first polling provider list endpoints

#### Scenario: Pull request needs attention
- **WHEN** an authored open pull request is a draft, has requested changes, failed checks or Actions workflow, a conflicting or unmergeable state, or a linked incomplete OpenSpec
- **THEN** the dashboard shows its linked title and PR number, draft/ready state, Actions status, all other known status fields, and nested OpenSpec evidence

#### Scenario: Automated reviewer progress is known
- **WHEN** a configured bot-review signal has been projected for the pull request
- **THEN** the PR card shows the reviewer identity and whether its review is in progress or complete separately from the formal review decision

#### Scenario: Pull request is healthy
- **WHEN** an authored open pull request has no projected attention condition
- **THEN** it is omitted from the exception dashboard

#### Scenario: Pull request has a linked unfinished OpenSpec group
- **WHEN** an OpenSpec is correlated to the pull request by commit or unique branch
- **THEN** the PR card shows its progress, complete current unfinished group as disabled checked and unchecked source-state checkboxes, and source action rather than a separate OpenSpec dashboard card

#### Scenario: Recent deployments have mixed outcomes
- **WHEN** verified, pending, or error deployment projections were updated within the last 48 hours
- **THEN** the dashboard shows all of them newest first and omits older deployments

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
