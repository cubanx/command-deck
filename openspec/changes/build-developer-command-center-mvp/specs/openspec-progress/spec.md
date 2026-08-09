## ADDED Requirements

### Requirement: Committed OpenSpec task projection
The system SHALL derive OpenSpec progress from committed `openspec/changes/*/tasks.md` repository artifacts by counting standard incomplete and complete Markdown task checkboxes.

#### Scenario: Push changes a task artifact
- **WHEN** a trusted push event lists a changed committed OpenSpec tasks file
- **THEN** the system fetches only that artifact with an installation token and stores completed count, total count, status, and source commit

#### Scenario: Tasks artifact is deleted
- **WHEN** a trusted push event lists a tracked tasks file as removed
- **THEN** the corresponding OpenSpec projection is removed

### Requirement: Repository workflow remains authoritative
The system MUST NOT create a second OpenSpec workflow engine or represent uncommitted worktree state.

#### Scenario: No committed tasks artifact exists
- **WHEN** a change exists only in a local worktree
- **THEN** the command center shows no progress for it

### Requirement: Completion transition
The system SHALL recognize completion only when a non-empty committed task artifact transitions from incomplete to all complete.

#### Scenario: Final task is committed complete
- **WHEN** the parsed artifact changes from fewer completed tasks than total tasks to equal non-zero counts
- **THEN** the projection becomes complete and one user-scoped completion notification is eligible
