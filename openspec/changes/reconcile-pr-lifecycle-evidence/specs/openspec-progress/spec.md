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
The pull-request lifecycle SHALL expose a deterministically sorted and deduplicated collection of every OpenSpec declared by an exact human-readable PR-body `## OpenSpecs` section and SHALL require every collection item to be pre-merge ready. When present, that section is authoritative and exhaustive: each exact change slug MUST resolve to a committed active OpenSpec at the exact PR head, except that an active-path 404 MAY resolve through exactly one already-fetched current changed-file path matching `openspec/changes/archive/YYYY-MM-DD-<slug>/tasks.md` at that head; zero or multiple archive matches, or any non-404 provider failure, SHALL fail closed. Archive paths are locator evidence only after the declaration and never correlate a PR alone. Missing, invalid, duplicate, or conflicting declarations SHALL fail closed. An empty declaration SHALL be the explicit no-OpenSpec path only with the exact `openspec-not-required` label. A repository snapshot at the PR head, including a changes-directory listing, MUST NOT alone create a correlation. Changed paths under `openspec/changes/<slug>/...` whose status is not `removed` SHALL be projected only as detected/inferred informational candidates. Without an authoritative section, detected candidates SHALL create a `Confirm OpenSpec association` blocker until the PR body declares the exhaustive list or the exact `openspec-not-required` label applies; with a valid authoritative section, unlisted detected candidates SHALL remain informational and SHALL NOT gate. The deterministic first confirmed collection item SHALL remain available through the existing singular field only for legacy compatibility. When the confirmed collection is empty, the gate SHALL be exempt only when the pull request has the exact `openspec-not-required` label. The label MUST NOT bypass an existing incomplete confirmed OpenSpec, and it SHALL conflict fail closed with a nonempty authoritative declaration.

#### Scenario: Pull request has no OpenSpec and explicit exemption
- **WHEN** no OpenSpec is correlated and the pull request has the exact `openspec-not-required` label
- **THEN** the OpenSpec gate is not applicable and does not block Ready for review or Mergeable

#### Scenario: Pull request has no OpenSpec or exemption
- **WHEN** no OpenSpec is correlated and the pull request lacks the exact exemption label
- **THEN** the lifecycle remains at OpenSpec ready and shows `No OpenSpec found` as the blocker

#### Scenario: Incomplete OpenSpec also has exemption label
- **WHEN** one or more correlated OpenSpecs have unfinished unmarked tasks and the pull request also has `openspec-not-required`
- **THEN** the incomplete OpenSpec continues to block readiness

#### Scenario: Exact-head correlation has multiple matches
- **WHEN** an authoritative `## OpenSpecs` section lists more than one valid exact change slug that resolves at a pull request's exact head
- **THEN** the collection contains every deterministically sorted and deduplicated declared OpenSpec

#### Scenario: Unique-branch correlation has multiple matches
- **WHEN** an authoritative `## OpenSpecs` section lists more than one valid exact change slug and changed paths suggest branch attribution
- **THEN** the collection contains every deterministically sorted and deduplicated declared OpenSpec rather than using branch attribution

#### Scenario: Exact-head correlation suppresses branch fallback
- **WHEN** an authoritative `## OpenSpecs` section declares valid changes and changed paths detect other candidates
- **THEN** the collection contains only the declared OpenSpecs while unlisted detected candidates remain informational

#### Scenario: Directory listing alone does not correlate an OpenSpec
- **WHEN** a repository snapshot at a pull request's head lists one or more OpenSpec artifacts but no accepted PR-specific evidence relates them to the pull request
- **THEN** the collection remains empty and the listed artifacts do not affect lifecycle or merge eligibility

#### Scenario: Detected changes await confirmation
- **WHEN** changed paths detect one or more OpenSpec candidates and the PR body has no `## OpenSpecs` section or exact exemption label
- **THEN** detected candidates remain informational and lifecycle shows `Confirm OpenSpec association` as a blocker

#### Scenario: Invalid authoritative declaration fails closed
- **WHEN** a `## OpenSpecs` section has a missing, invalid, duplicate, or conflicting change declaration
- **THEN** no declared OpenSpec is treated as ready and lifecycle and guarded merge eligibility remain blocked

#### Scenario: Nonempty declaration conflicts with exemption
- **WHEN** a PR has a nonempty valid `## OpenSpecs` section and the exact `openspec-not-required` label
- **THEN** the conflict fails closed and the label does not exempt the OpenSpec gate

#### Scenario: Empty declaration uses the no-OpenSpec path
- **WHEN** a PR has an empty `## OpenSpecs` section and the exact `openspec-not-required` label
- **THEN** the confirmed collection is empty and the OpenSpec gate is exempt

#### Scenario: Legacy singular OpenSpec compatibility
- **WHEN** the collection contains one or more correlated OpenSpecs
- **THEN** the existing singular OpenSpec field contains the deterministic first collection item while lifecycle and merge eligibility evaluate every collection item

#### Scenario: Exemption label changes
- **WHEN** the exact exemption label is added to or removed from an open pull request
- **THEN** the affected pull request is eligible for targeted lifecycle reconciliation
