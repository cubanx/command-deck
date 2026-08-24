## MODIFIED Requirements

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
