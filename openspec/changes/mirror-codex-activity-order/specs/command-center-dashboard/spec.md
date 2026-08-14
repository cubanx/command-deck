## ADDED Requirements

### Requirement: Browser-local Codex activity configuration
Command Deck SHALL let the user select the supported Codex activity-order JSON file from Configuration, persist its file handle only in browser-local storage, revalidate permission before reads, and never upload the file, its contents, or its handle to the hosted service.

#### Scenario: Select activity file
- **WHEN** the user selects a supported activity file and grants permission
- **THEN** Command Deck stores the handle browser-locally, validates the file, and displays its generation and refresh status

#### Scenario: Permission is lost
- **WHEN** a persisted handle no longer has read permission
- **THEN** Command Deck visibly disables activity ordering until the user restores permission or selects another file

#### Scenario: Unsupported schema
- **WHEN** the selected file is malformed or has an unsupported schema version
- **THEN** Command Deck rejects it visibly and retains the ordinary Workflow ordering

### Requirement: Native observation with refresh fallbacks
Command Deck SHALL reread a configured activity file when it changes, using `FileSystemObserver` when supported and tab-focus plus explicit manual refresh as always-available fallbacks.

#### Scenario: Observer-supported browser
- **WHEN** the configured file changes and `FileSystemObserver` is available
- **THEN** Command Deck refreshes activity ordering from the new complete generation

#### Scenario: Observer-unavailable browser
- **WHEN** `FileSystemObserver` is unavailable
- **THEN** returning focus to the tab or choosing manual refresh rereads the configured file

### Requirement: Repository-scoped activity correlation
Command Deck SHALL correlate an activity record only when canonical repository identity and branch or pull-request identity resolve to exactly one known pull request. It MUST NOT correlate by branch name alone across repositories.

#### Scenario: Unique repository and branch match
- **WHEN** an activity record's canonical repository and branch identify exactly one known pull request
- **THEN** Command Deck attaches that record's completed-turn order to that pull request

#### Scenario: Unmatched record
- **WHEN** no known pull request matches an activity record
- **THEN** Command Deck shows the record as unmatched and does not attach it to a pull request

#### Scenario: Ambiguous record
- **WHEN** an activity record matches more than one known pull request or its repository identity is not verified
- **THEN** Command Deck shows the ambiguity and does not attach the record to any pull request

### Requirement: Optional Codex activity ordering
Command Deck SHALL offer an optional `Codex activity` sort mode without changing the default sort. In that mode, matched pull requests SHALL follow newest completed-turn order, while every unmatched pull request SHALL retain the exact deterministic ordinary Workflow ordering supplied by the prerequisite Command Center Controls change.

#### Scenario: Matched activity order
- **WHEN** the user selects `Codex activity` and multiple pull requests have uniquely correlated records
- **THEN** those pull requests appear in newest completed-turn order

#### Scenario: Deterministic unmatched fallback
- **WHEN** one or more pull requests lack a uniquely correlated activity record
- **THEN** their relative order is the same as the ordinary Workflow ordering

#### Scenario: Activity input becomes unavailable
- **WHEN** the file is unreadable, invalid, or loses permission while `Codex activity` is selected
- **THEN** Command Deck visibly reports the condition and displays pull requests in ordinary Workflow order
