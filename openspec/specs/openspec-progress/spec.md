# openspec-progress Specification

## Purpose
TBD - created by archiving change build-developer-command-center-mvp. Update Purpose after archive.
## Requirements
### Requirement: Committed OpenSpec task projection
The system SHALL derive OpenSpec progress from committed `openspec/changes/*/tasks.md` repository artifacts by counting standard incomplete and complete Markdown task checkboxes and retaining the source branch, commit, and first heading group containing an unchecked task with every task in that group.

#### Scenario: Push changes a task artifact
- **WHEN** a trusted push event lists a changed committed OpenSpec tasks file
- **THEN** the system fetches only that artifact with an installation token and stores completed count, total count, current unfinished group, source branch, and source commit

#### Scenario: A group is partially complete
- **WHEN** the task artifact contains a heading group with at least one unchecked task
- **THEN** the projection retains the heading and every checked and unchecked task in that first unfinished group in source order

#### Scenario: Tasks artifact is deleted
- **WHEN** a trusted push event lists a tracked tasks file as removed
- **THEN** the corresponding OpenSpec projection is removed

### Requirement: Repository workflow remains authoritative
The system MUST NOT create a second OpenSpec workflow engine, clone repositories, or send local worktree contents to the hosted service; an explicitly connected checkout MAY overlay locally parsed task artifacts in the browser.

#### Scenario: No committed tasks artifact exists
- **WHEN** a change exists only in a local worktree and no checkout is connected
- **THEN** the hosted command center shows no progress for it

### Requirement: Explicit local checkout bridge
The PWA SHALL let a developer grant read-only access to one local checkout, SHALL inspect only `openspec/changes/*/tasks.md` in the browser, and MUST NOT upload local paths or contents to the hosted service.

#### Scenario: Developer connects a checkout
- **WHEN** a supported browser grants a directory handle from a developer action
- **THEN** the client presents locally parsed OpenSpec progress and complete current unfinished groups alongside committed projections

#### Scenario: Browser lacks directory access
- **WHEN** the native directory picker is unavailable
- **THEN** committed projections remain usable and the local-checkout action explains that the browser is unsupported

### Requirement: OpenSpec source link
The system SHALL link each hosted OpenSpec projection to its committed GitHub task artifact and SHALL let a locally connected projection open the already granted local file content without exposing its absolute path to the service.

#### Scenario: Developer opens a projected OpenSpec source
- **WHEN** the projection came from a committed repository artifact
- **THEN** its source action targets the HTTPS GitHub blob URL for the stored commit and task path

#### Scenario: Developer opens a local OpenSpec source
- **WHEN** a locally connected projection retains its granted file handle
- **THEN** its source action opens that task artifact from the browser without a network request

### Requirement: Pull-request-owned OpenSpec evidence
The system SHALL attach OpenSpec progress to a pull request in the same installation and repository only by exact head/source commit or one unique head/source branch match, and MUST NOT guess when evidence is absent or ambiguous.

#### Scenario: OpenSpec commit matches a pull request head
- **WHEN** an OpenSpec source commit equals one open pull request head commit in the same repository
- **THEN** that pull request owns the OpenSpec status and full current unfinished group

#### Scenario: OpenSpec branch has one matching pull request
- **WHEN** no commit matches and exactly one open pull request head branch equals the OpenSpec source branch
- **THEN** that pull request owns the OpenSpec evidence

#### Scenario: OpenSpec correlation is ambiguous
- **WHEN** more than one pull request could match or neither commit nor branch evidence matches
- **THEN** the dashboard does not attach the OpenSpec to any pull request

### Requirement: Completion transition
The system SHALL recognize completion only when a non-empty committed task artifact transitions from incomplete to all complete.

#### Scenario: Final task is committed complete
- **WHEN** the parsed artifact changes from fewer completed tasks than total tasks to equal non-zero counts
- **THEN** the projection becomes complete and one user-scoped completion notification is eligible
