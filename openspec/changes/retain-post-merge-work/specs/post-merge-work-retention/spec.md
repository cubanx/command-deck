## Purpose

Keep authored merged pull requests visible while their declared follow-up work remains incomplete or its completion evidence is unresolved.

For merged candidates this capability governs eligibility, removal, progress source, filtering and ordering in place of earlier open-only lifecycle assumptions. Existing open-PR behavior continues unchanged.

## ADDED Requirements

### Requirement: Evidence-based retention eligibility
The system SHALL retain authored merged PRs with valid unchecked tasks under explicit `[post-merge]` groups. It SHALL retain unresolved declared work pending verification, including invalid declarations. Verified absent or empty declarations without a previously retained obligation SHALL remain outside retention. An enrolled obligation MUST NOT be removed through missing evidence, removed declarations, or changed task-group markers.

#### Scenario: Explicit unfinished follow-up
- **WHEN** an authored merged PR has unchecked tasks in an explicit post-merge group
- **THEN** it remains eligible for the dashboard

#### Scenario: No declared work
- **WHEN** a merged PR has a verified absent or empty declaration and no enrolled obligation
- **THEN** it is excluded without claiming task completion

#### Scenario: Declared work cannot be resolved
- **WHEN** a declaration is invalid or any declared task artifact cannot be validated
- **THEN** the merged PR remains visible with unresolved evidence

### Requirement: Affirmative current completion
The system SHALL use an immutable current default-branch commit to evaluate every declared and enrolled change after merge. It SHALL remove an enrolled PR only when all those changes have valid nonempty complete task evidence. An unambiguous current archived task file SHALL be acceptable evidence; deletion, ambiguity, zero tasks, read failure, and old head evidence MUST NOT imply completion. New candidates with fully valid evidence and no unfinished post-merge work SHALL be excluded.

#### Scenario: Completion after merge
- **WHEN** all associated task files at the authoritative default-branch commit have positive totals and all tasks checked
- **THEN** the retained PR is removed after successful persistence

#### Scenario: Archive or deletion
- **WHEN** active tasks disappear
- **THEN** exactly one matching current archive is evaluated, or retention remains unresolved if no unique valid evidence exists

#### Scenario: Feature branch reports completion
- **WHEN** a feature-branch push reports all tasks checked
- **THEN** it cannot discharge the retained default-branch obligation

### Requirement: Convergence across producers
Webhook projection, targeted repair, broad repair, and scheduled known-PR reconciliation SHALL preserve eligible merged work and converge using the same evidence rules. An open-only list omission MUST NOT remove retained work. Explicit targeted repair SHALL recover an absent authored merged projection by repository and PR number within the user's authorized installation. Newer lifecycle/progress evidence MUST NOT be overwritten by older reads.

#### Scenario: Broad repair omits merged PR
- **WHEN** the open PR list no longer includes a retained PR
- **THEN** repair evaluates the retained candidate separately and preserves it until completion is proven

#### Scenario: Previously removed record
- **WHEN** targeted repair identifies an authorized authored merged PR with unfinished post-merge work but no saved PR projection
- **THEN** repair restores the retained projection without an unbounded historical scan

#### Scenario: Delayed completion read
- **WHEN** an older completion response arrives after newer incomplete evidence
- **THEN** it does not remove or regress the retained record

### Requirement: Visible merged work precedes open work
The dashboard SHALL display retained work as Post-merge with verified Merged status, never stale Draft status, and SHALL disable merge actions. Default filters and Clear SHALL include retained work. Search, repository and lifecycle filters SHALL remain effective. Retained results SHALL precede open results independent of sort direction, with the existing comparator unchanged within each group. Persisted changes SHALL invalidate affected dashboards.

#### Scenario: Mixed result ordering
- **WHEN** both retained and open PRs match the selected filters
- **THEN** retained PRs appear first for every supported sort mode and direction, preserving that comparator within each group

#### Scenario: Default dashboard after merge
- **WHEN** a previously draft PR is retained after verified merge
- **THEN** it appears under default filters as Merged/Post-merge with progress or unresolved status and no enabled merge action
