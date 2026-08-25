## MODIFIED Requirements

### Requirement: Committed OpenSpec task projection
The system SHALL derive OpenSpec progress from committed `openspec/changes/*/tasks.md` repository artifacts by counting standard incomplete and complete Markdown task checkboxes, retaining total progress, and separately deriving pre-merge readiness from task groups. A task group whose heading contains the exact marker `[post-merge]` SHALL remain in total progress but SHALL NOT block pre-merge readiness regardless of task wording. Every unchecked task in an unmarked group SHALL block readiness. The service SHALL trust the exact heading and SHALL NOT infer group semantics from task prose; repository guidance SHALL prevent groups that mix pre-merge and post-merge work.

#### Scenario: Push changes a task artifact
- **WHEN** a trusted push event lists a changed committed OpenSpec tasks file
- **THEN** the system fetches only that artifact with an installation token and stores completed count, total count, pre-merge readiness, current unfinished pre-merge group, source branch, and source commit

#### Scenario: A group is partially complete
- **WHEN** an unmarked heading group contains at least one unchecked task
- **THEN** the projection is not pre-merge ready and retains the heading and every checked and unchecked task in that first unfinished unmarked group in source order

#### Scenario: Only post-merge work remains
- **WHEN** every checkbox outside groups marked exactly `[post-merge]` is complete and one or more marked tasks remain unchecked
- **THEN** the projection is pre-merge ready while total progress continues to include the unchecked post-merge work

#### Scenario: Post-merge wording is only inferred
- **WHEN** an unchecked task mentions deploy, production, verification, rollout, or similar timing without belonging to an exact `[post-merge]` group
- **THEN** the task blocks pre-merge readiness

#### Scenario: A marked group contains pre-merge-like wording
- **WHEN** a `[post-merge]` group contains unchecked task wording that could describe work before merge
- **THEN** the projection remains pre-merge ready when every unmarked group is complete because the service trusts the exact heading and does not inspect task prose

#### Scenario: Tasks artifact is deleted
- **WHEN** a trusted push event lists a tracked tasks file as removed
- **THEN** the corresponding OpenSpec projection is removed

## ADDED Requirements

### Requirement: Explicit OpenSpec applicability
The pull-request lifecycle SHALL require every correlated OpenSpec to be pre-merge ready. When no OpenSpec is correlated, the gate SHALL be exempt only when the pull request has the exact `openspec-not-required` label. The label MUST NOT bypass an existing incomplete OpenSpec.

#### Scenario: Pull request has no OpenSpec and explicit exemption
- **WHEN** no OpenSpec is correlated and the pull request has the exact `openspec-not-required` label
- **THEN** the OpenSpec gate is not applicable and does not block Ready for review or Mergeable

#### Scenario: Pull request has no OpenSpec or exemption
- **WHEN** no OpenSpec is correlated and the pull request lacks the exact exemption label
- **THEN** the lifecycle remains at OpenSpec ready and shows `No OpenSpec found` as the blocker

#### Scenario: Incomplete OpenSpec also has exemption label
- **WHEN** one or more correlated OpenSpecs have unfinished unmarked tasks and the pull request also has `openspec-not-required`
- **THEN** the incomplete OpenSpec continues to block readiness

#### Scenario: Exemption label changes
- **WHEN** the exact exemption label is added to or removed from an open pull request
- **THEN** the affected pull request is eligible for targeted lifecycle reconciliation
