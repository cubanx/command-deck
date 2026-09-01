## Why

Command Deck.ai has a canonical human brand but its repository and local delivery identities are inconsistent. This change classifies each identifier, completes the safe local rename to `command-deck`, and records the separately authorized continuity work needed for providers.

## What Changes

- Canonicalize local repository, package, container, CI, fixture, scaffold, and stale documentation-title references to `command-deck` while retaining the human brand `Command Deck.ai`.
- Preserve Mongo production and test namespaces, Mongo users and credentials, provider IDs, archived OpenSpec evidence, and existing worktree paths.
- Record GitHub continuity, Railway relink and rename, Atlas, 1Password metadata, Codex continuity, rollback, and final-evidence work as review-, exact-SHA-, and authorization-gated tasks.

## Capabilities

### New Capabilities

- `durable-command-deck-identity`: Classification-first requirements for the Command Deck.ai repository and infrastructure identity transition.

### Modified Capabilities

- None.

## Impact

The pre-review implementation is local-only. The overall change includes external GitHub, Railway, Atlas, 1Password metadata, and Codex continuity work, but no external operation is executed without its stated evidence, review, and task-scoped authorization. Mongo namespaces, users, credentials, provider IDs, archived evidence, and existing worktree paths remain protected.
