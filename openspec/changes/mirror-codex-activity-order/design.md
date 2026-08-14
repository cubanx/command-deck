## Context

Current `main` does not contain PR #8. The PR #8 head (`cf93db43e228b6c6884d7dae377af78fd8f74904`) is not an ancestor of refreshed `main` (`9d2204060344d744e7b2d371c8420d6896f91233`). PR #8 owns the Configuration screen, browser-persisted local handles, permission revalidation, local refresh behavior, and ordinary Workflow ordering that this change extends. Implementation therefore remains blocked until PR #8 is merged, its exact merge SHA is verified on refreshed `main`, and those primitives are present.

Codex supports global `Stop` command hooks with JSON input on standard input, but implementation must verify the installed supported payload fields needed to prove main-thread completion and stable session identity. No field is inferred from transcript or rollout storage.

## Goals / Non-Goals

**Goals:**

- Produce one small versioned file after each completed main-thread turn.
- Keep all activity input and handles browser-local.
- Reuse PR #8 configuration, refresh, and ordering primitives.
- Make corruption, permission loss, unsupported versions, and correlation failure visible and testable.

**Non-Goals:**

- A daemon, localhost listener, browser extension, server endpoint, provider integration, or Railway persistence.
- Reading Codex rollout/state databases or parsing transcripts.
- Pinning, sections, dragging, start-of-turn ordering, or ordering subagent work.
- Installing or modifying global hooks during repository implementation.

## Decisions

### Gate all implementation on the merged PR #8 baseline

Before the first implementation task, refresh `main`, record PR #8's exact merge SHA, prove it is an ancestor of `HEAD`, and verify the required browser-local handle, Configuration, refresh, and ordinary Workflow comparator primitives. If any primitive is absent, stop and reconcile the follow-up artifacts rather than copying PR #8 work or stacking on its branch.

Alternative: implement against PR #8's feature branch. Rejected because it mixes ownership, creates a stacked dependency, and can encode a comparator that the merged work changes.

### Use one compact schema with array order as the ranking

Schema version 1 contains `schemaVersion`, `generation`, `generatedAt`, and `records`. Each record contains `sessionId`, canonical `repository` identity (`host`, `owner`, `name`), `branch`, optional `pullRequestNumber`, and `completedAt`. Records are newest-first, so no second rank field is needed. A session update removes its prior record and prepends the replacement.

Alternative: store prompts, task titles, summaries, local paths, or an event history. Rejected as unnecessary and privacy-expanding. Alternative: use branch alone. Rejected because branches are not globally unique.

### Derive repository identity from Git, not path text

The writer resolves the working tree's canonical configured remote identity and current branch, normalizes host/owner/name, and rejects absent or ambiguous identity. An optional PR number may be recorded only when supplied by a verifiable local source; it is not guessed. The writer accepts only the minimum verified hook fields needed for session identity, main-thread status, completion, and working directory, then discards the input.

Alternative: persist the working directory or correlate by folder/branch name. Rejected because paths leak local details and names collide.

### Serialize and atomically replace

Each short-lived writer acquires an exclusive lock adjacent to the destination, rereads the latest complete file while holding it, validates the schema, applies one deduplicating prepend, increments `generation`, writes a same-directory temporary file, syncs it, and renames it over the destination. Lock acquisition is bounded; stale-lock recovery must be ownership-safe and tested before adoption. This uses the runtime and filesystem primitives already available rather than adding a package.

Alternative: append JSONL. Rejected because deduplication and stable newest-first task order would require compaction. Alternative: a daemon or database. Rejected as more machinery and a larger trust boundary.

### Extend PR #8's browser-local ingestion path

The activity handle uses the same browser-local persistence and permission lifecycle as PR #8's checkout handles. Parsing is strict and versioned. `FileSystemObserver` is feature-detected as progressive enhancement; focus and manual refresh always remain. Only complete generations replace the last valid in-memory view.

Alternative: poll continuously. Rejected because focus/manual refresh already provide portable recovery and completed-turn ordering does not require real-time behavior.

### Correlate first, sort second

Records are indexed by canonical repository identity, then matched by verified PR number or branch identity. Zero or multiple candidates become visible unmatched/ambiguous diagnostics and never affect a PR. In `Codex activity` mode, uniquely matched PRs use record position; all others use the exact ordinary Workflow comparator from the merged PR #8 baseline, including its deterministic tie-breaks.

Alternative: fuzzy repository matching or global branch matching. Rejected because a plausible wrong association is worse than a visible miss.

### Keep setup operational and explicit

The repository provides the writer, tests, an example `Stop` hook stanza, a dry-run/temporary-file validation command, and removal instructions. Enabling it requires the user to separately review and mutate global Codex configuration. Tests use temporary paths and never touch `~/.codex/hooks.json`.

## Risks / Trade-offs

- [Codex hook payload lacks a stable main-thread session field] → Verify the installed supported contract before implementation; stop and revise the schema/setup if proof is unavailable.
- [`FileSystemObserver` support is incomplete] → Keep focus and manual refresh paths first-class and tested.
- [A browser revokes persisted permission] → Show the loss, stop applying activity order, and preserve Workflow order.
- [Concurrent hooks contend or a process dies while holding the lock] → Bound acquisition, use ownership-safe cleanup, and test overlapping and interrupted writes.
- [Repository remotes have multiple aliases] → Normalize verified host/owner/name and fail visibly when identity is ambiguous.
- [PR #8 merges without the promised Workflow comparator] → Keep implementation blocked; do not invent a parallel fallback contract in this change.
- [Activity records accumulate] → Retain only the latest record per session and set a documented bounded record limit during implementation if real usage proves one necessary.

## Migration Plan

1. Merge PR #8 independently.
2. Refresh `main`; record and verify PR #8's exact merge SHA and required primitives.
3. Implement and validate the writer, schema, browser ingestion, correlation, and sort in repository-governed review groups.
4. Merge and deploy through separate authorized workflows; no activity data is deployed or seeded.
5. Only after code review, a user may explicitly install the reviewed global `Stop` hook and select its output file in Configuration.

Rollback is to disable `Codex activity`, forget the browser-local file handle, and separately remove the global hook stanza. Hosted data and default Workflow ordering remain unchanged.
