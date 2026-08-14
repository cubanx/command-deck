## Purpose

Defines a private, browser-local activity-order file and a minimal completed-turn writer that mirrors Codex task recency without exposing conversation content or running a companion service.

## ADDED Requirements

### Requirement: Versioned privacy-minimal activity file
The activity writer SHALL produce JSON containing only a schema version, generation timestamp, monotonically increasing generation, and newest-first records with an opaque stable session identity, canonical repository identity, branch and optional pull-request correlation, and completion timestamp. It MUST NOT store prompts, assistant messages, transcripts, task summaries, secrets, provider credentials, or local filesystem paths.

#### Scenario: Valid minimal file
- **WHEN** a completed main-thread turn supplies valid session and Git repository correlation
- **THEN** the writer records only the allowed fields under the supported schema version

#### Scenario: Privacy exclusions
- **WHEN** the hook input contains conversation content, credentials, summaries, or local paths
- **THEN** none of those values appear in the activity file

### Requirement: Completed main-thread Stop updates only
The writer SHALL update activity only for a global Codex `Stop` event that proves a completed main-thread turn. It MUST NOT update from `UserPromptSubmit`, subagent completion, start-of-turn activity, or a continuously running process.

#### Scenario: Completed main-thread turn
- **WHEN** a valid global `Stop` invocation identifies a completed main-thread turn
- **THEN** that session becomes the newest activity record

#### Scenario: Unproven or subordinate invocation
- **WHEN** an invocation cannot prove that it represents a completed main-thread turn
- **THEN** the writer exits without changing the activity file and reports a sanitized diagnostic

### Requirement: Stable deduplication and ordering
The writer SHALL keep at most one record per stable session identity and SHALL move an existing session record to newest position after each later completed turn. File order SHALL define activity order, and each successful write SHALL advance the file generation.

#### Scenario: Repeated completed turns
- **WHEN** the same stable session completes another turn
- **THEN** its existing record is replaced at the newest position without creating a duplicate

### Requirement: Atomic concurrent updates
The writer SHALL serialize read-modify-replace operations and atomically replace the destination so concurrent completed turns cannot corrupt the JSON, lose a committed newer generation, or expose a partial file.

#### Scenario: Concurrent completions
- **WHEN** two valid completed-turn writers overlap
- **THEN** the resulting file is valid, contains both latest session updates, and has a generation reflecting both writes

#### Scenario: Interrupted replacement
- **WHEN** a writer fails before atomic replacement completes
- **THEN** readers continue to observe the prior complete generation

### Requirement: Explicit reviewable setup
The repository SHALL provide a reviewable writer entry point, example global `Stop` hook configuration, validation command, and removal instructions. Repository implementation and tests MUST NOT install or modify the user's global Codex hook configuration.

#### Scenario: Repository validation
- **WHEN** a contributor follows the repository validation path
- **THEN** the writer and example configuration can be checked using a temporary destination without changing `~/.codex/hooks.json`

#### Scenario: User-controlled installation
- **WHEN** a user chooses to enable the integration
- **THEN** modifying global Codex configuration remains a separate explicit local operational action
