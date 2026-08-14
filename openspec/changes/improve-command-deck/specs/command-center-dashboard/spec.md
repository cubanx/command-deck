## MODIFIED Requirements

### Requirement: Personal operational summary
The system SHALL present every authorized open pull request authored by the signed-in developer with title, PR number, draft state, attention classification, distinct Actions/check/formal-review/automated-review/mergeability evidence, a guarded Merge control, and branch/SHA-linked OpenSpec status, plus recent authoritative GitHub deployment projections, from local installation-scoped projections. The default pull-request order SHALL use the mutually exclusive Mergeable, Ready for review, and Draft buckets followed by pull-request number descending within each bucket.

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

#### Scenario: GitHub Actions workflow fails
- **WHEN** a signed `workflow_run` projection reports one or more failed workflows with authoritative names and GitHub run URLs
- **THEN** the PR card shows each failed workflow name linked to its run while preserving the separate Checks aggregate

#### Scenario: Pull request has a linked unfinished OpenSpec group
- **WHEN** an OpenSpec is correlated to the pull request by repository identity and exact commit or unique branch
- **THEN** the PR card shows a collapsed native disclosure whose summary contains the change name, total progress, current unfinished group, and existing Open tasks link
- **AND** expanding the disclosure shows that current group's disabled checked and unchecked source-state checklist

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
- **THEN** its Merge control remains visible but unavailable with an accessible reason

## ADDED Requirements

### Requirement: Sticky pull-request controls
The dashboard SHALL keep a compact controls bar visible while scrolling the pull-request list, SHALL use native accessible controls with labeled focus order and keyboard operation, and SHALL remain usable when controls wrap on narrow screens. The bar SHALL contain fuzzy search, status filters, repository filtering, the final visible result count, and one Clear action for all search and filter state.

#### Scenario: Developer scrolls or narrows the pull-request list
- **WHEN** the pull-request list extends beyond the viewport or the viewport is narrow
- **THEN** the controls remain sticky, readable, keyboard reachable, and usable without obscuring the pull-request content

#### Scenario: Developer combines controls
- **WHEN** search, status, and repository filters are active together
- **THEN** the visible result count reflects the final intersection and Clear resets every search and filter control

### Requirement: Dependency-free fuzzy pull-request search
The dashboard SHALL filter immediately as the developer types using a small dependency-free matcher over PR title, owner/repository, branch, and linked OpenSpec change name. Exact, prefix, and substring matches SHALL rank before typo-tolerant matches, while a PR-number query SHALL match only that exact number.

#### Scenario: Developer searches pull-request evidence
- **WHEN** a query matches a title, owner/repository, branch, or linked OpenSpec change name
- **THEN** matching cards appear in deterministic match-quality order within their status bucket

#### Scenario: Developer searches by pull-request number
- **WHEN** the query is numeric
- **THEN** only the pull request with that exact number matches

#### Scenario: Developer uses search shortcuts
- **WHEN** the developer presses `/` outside an editable control or Escape while search is focused
- **THEN** `/` focuses search and Escape clears its current value

### Requirement: Exclusive pull-request status buckets
Every projected pull request SHALL belong to exactly one clickable status-filter bucket with this precedence: Mergeable for authoritative `mergeable=true` or clean state even when draft; Ready for review for every remaining non-draft; Draft for every remaining draft. Default ordering SHALL be Mergeable, Ready for review, then Draft, with PR number descending within each bucket.

#### Scenario: Draft pull request is authoritatively mergeable
- **WHEN** a draft pull request has authoritative `mergeable=true` or clean state
- **THEN** it belongs only to Mergeable and sorts with that bucket

#### Scenario: Status filters are selected
- **WHEN** the developer activates one or more status pills
- **THEN** only pull requests in those same mutually exclusive buckets remain visible

### Requirement: Searchable repository multi-select
The repository filter SHALL be a searchable multi-select dropdown that displays owner/repository names, permits more than one selection, and makes active selections apparent without rendering one pill per repository.

#### Scenario: Developer selects repositories
- **WHEN** the developer searches the repository dropdown and selects multiple owner/repository entries
- **THEN** pull requests from any selected repository remain eligible for the combined result set and the active filter state is evident

### Requirement: Pull-request section has an accessible non-visual name
The dashboard SHALL not show a visible pull-request section heading and SHALL preserve the section's accessible landmark name using the existing visually-hidden or ARIA convention.

#### Scenario: Assistive technology navigates the pull-request section
- **WHEN** the dashboard renders pull-request cards
- **THEN** the section has an accessible name without displaying a replacement heading

### Requirement: One configuration screen
Both existing top-level configuration actions SHALL open the same configuration screen, which SHALL own local checkout mappings, the existing notification permission configuration, appearance preferences, and user-scoped reconciliation.

#### Scenario: Developer selects either existing action
- **WHEN** the developer activates Connect local checkout or Enable notifications
- **THEN** the same configuration screen opens with the corresponding control available

#### Scenario: Configuration state has an error
- **WHEN** a checkout permission, repository resolution, notification permission, or reconciliation operation cannot proceed
- **THEN** the screen exposes an accessible explicit state and sanitized next action

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
