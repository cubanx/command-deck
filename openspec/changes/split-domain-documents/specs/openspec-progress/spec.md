## MODIFIED Requirements

### Requirement: Pull-request-owned OpenSpec evidence
The system SHALL attach local or committed OpenSpec progress to a pull request in the same installation and stable repository identity only by exact head/source commit or one unique head/source branch match, and MUST NOT guess when repository identity or evidence is absent or ambiguous. Committed evidence SHALL be embedded in its PR document, with no standalone OpenSpec root. After merge the same PR SHALL retain immutable merged-commit evidence and separately sourced default-branch progress through completion. No unassociated OpenSpec SHALL appear on the dashboard, including browser-local overlays.

#### Scenario: OpenSpec commit matches a pull request head
- **WHEN** an OpenSpec source commit equals one open pull request head commit in the same repository identity
- **THEN** that pull request owns the OpenSpec status and full current unfinished group

#### Scenario: OpenSpec branch has one matching pull request
- **WHEN** no commit matches and exactly one open pull request in the same repository identity has a head branch equal to the OpenSpec source branch
- **THEN** that pull request owns the OpenSpec evidence

#### Scenario: Same branch name exists in multiple repositories
- **WHEN** more than one repository has a pull request or local checkout using the same branch name
- **THEN** each branch match remains scoped to its stable repository identity

#### Scenario: OpenSpec correlation is ambiguous
- **WHEN** repository identity is unverified, more than one pull request in that repository could match, or neither commit nor branch evidence matches
- **THEN** the dashboard does not attach the OpenSpec to any pull request

#### Scenario: Post-merge tasks change
- **WHEN** a default-branch commit updates tasks for a verified merged PR obligation
- **THEN** its original PR document receives that exact-commit progress without overwriting the evidence from the merge

#### Scenario: No associated PR
- **WHEN** an OpenSpec exists without a provable PR association
- **THEN** it remains absent from the dashboard and is not persisted as a standalone OpenSpec document

### Requirement: Completion transition
The system SHALL recognize completion only when a non-empty committed task artifact transitions from incomplete to all complete.

#### Scenario: Final task is committed complete
- **WHEN** the parsed artifact changes from fewer completed tasks than total tasks to equal non-zero counts
- **THEN** the PR-owned projection becomes complete without creating a notification

### Requirement: Committed OpenSpec task projection
The system SHALL derive OpenSpec progress from committed `openspec/changes/*/tasks.md` repository artifacts by counting standard incomplete and complete Markdown task checkboxes and retaining the source branch, commit, and first heading group containing an unchecked task with every task in that group.

#### Scenario: Push changes a task artifact
- **WHEN** a trusted push event lists a changed committed OpenSpec tasks file
- **THEN** the system fetches only that artifact with an installation token and, when an associated PR is proven, stores completed count, total count, current unfinished group, source branch, and source commit

#### Scenario: A group is partially complete
- **WHEN** the task artifact contains a heading group with at least one unchecked task
- **THEN** the projection retains the heading and every checked and unchecked task in that first unfinished group in source order

#### Scenario: Tasks artifact is deleted
- **WHEN** a trusted push event lists a tracked tasks file as removed
- **THEN** current evidence for that source is removed while the PR's merged-commit evidence is preserved, and absence does not mark an unfinished post-merge obligation complete
