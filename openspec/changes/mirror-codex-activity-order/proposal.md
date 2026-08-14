## Why

Command Deck cannot currently mirror the recency of completed local Codex work without a network companion or access to private Codex state. A small, explicitly selected browser-local order file can provide that signal while preserving the dashboard's hosted-data boundary and PR #8's ownership of local-file configuration primitives.

## What Changes

- Add a global Codex `Stop` hook writer that atomically records only versioned repository, branch/PR correlation, session deduplication, and completion-order metadata after completed main-thread turns.
- Add a reviewable setup path for the writer and hook configuration without installing or modifying `~/.codex/hooks.json` from repository code.
- Extend PR #8's Configuration flow to select, persist, permission-check, and refresh the order file entirely in the browser.
- Prefer `FileSystemObserver` when available while retaining tab-focus and explicit manual refresh fallbacks.
- Correlate records to known PRs by verified repository identity plus branch or PR identity, and surface unmatched or ambiguous records instead of guessing.
- Add an optional `Codex activity` sort in which matched PRs follow completed-turn order and unmatched PRs retain PR #8's deterministic Workflow ordering.
- Exclude prompts, responses, transcripts, summaries, secrets, credentials, unnecessary paths, pinning, sections, dragging, start-of-turn ordering, background services, listeners, extensions, Codex database reads, transcript parsing, and server synchronization.
- Block implementation until PR #8 is merged, its exact merge SHA is verified on refreshed `main`, and its browser-local handle, Configuration, refresh, and Workflow-order primitives are present.

## Capabilities

### New Capabilities

- `codex-activity-order`: Defines the privacy-minimal versioned file, atomic completed-turn writer, repository-scoped correlation, validation, and explicit local setup contract.

### Modified Capabilities

- `command-center-dashboard`: Adds browser-local file selection and permission handling, observer and fallback refresh, visible correlation failures, and optional Codex-activity sorting with deterministic Workflow fallback.

## Impact

- Affects a small local writer/setup surface plus the post-PR #8 browser Configuration, local-file refresh, PR projection, and sorting paths.
- Adds no network service, hosted persistence, provider mutation, production operation, or dependency unless implementation proves the repository's native runtime insufficient.
- Depends on PR #8 merging before implementation; this change is proposed from current `main` and must not be stacked on or modify PR #8.
