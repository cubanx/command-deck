## Context

Baseline: `acdffe49c0fd182c7dd671ad3c809fc972f80928`, verified as remote main during review. The transferred proposal matched SHA-256 `da9a7df674f101f174401bc627562bbcc3efc5c40bac10488d338bc4ac26dc76` before this task expanded it. The original temporary-worktree source remains intact.

Webhook closure removes the PR (`events.ts`); targeted reconciliation returns no record for CLOSED/MERGED (`github.ts`); broad bootstrap replaces the list from `state=open`. Serving filters to open and the view model excludes closed. Existing OpenSpec reads use the PR head. `recentMergedPullRequests` is deployment-correlation evidence capped at 100 entries/48 hours, not a work queue.

Controller-supplied example: data-warehouse PR 143 merged at `e7e400edb6b0c463a6007f8e4c8691c9be99b067`, while the dashboard showed Draft 4/9; committed tasks reportedly show 5/9 with four unchecked post-merge tasks. This task has not independently refreshed those provider observations.

## Goals / Non-Goals

Preserve authored work through merge and refresh its authoritative progress. Keep identity, account, signature, and merge-control checks. No provider mutation, automatic unbounded historical discovery, timer-based expiry of obligations, or changes to within-group comparators.

## Decisions

1. Keep retained PRs in the existing PR projection, recording verified merged lifecycle and retention evidence independently of draft/review readiness. Reuse existing task parsing and declaration validation. Use one shared eligibility decision across producer and serving paths; a UI-only exception cannot recover deleted records.
2. Distinguish incomplete post-merge work, unresolved declared work, and verified non-eligibility/completion. Valid declarations with unavailable tasks and malformed declarations remain visible as unresolved rather than guessed complete. Verified absent/empty declarations without prior retained obligations are excluded. Existing retained obligations cannot be erased by deleting the declaration or task file. Valid complete reads showing no unfinished post-merge work do not enroll a new record; enrolled records require every associated obligation's nonempty task evidence to be complete before removal. Changing/removing markers alone does not discharge an enrolled obligation.
3. Read merged status and default-branch identity authoritatively. Resolve the branch once to an immutable SHA for a progress pass; read every declared/enrolled change at that SHA. Prefer active tasks, otherwise inspect the current tree for exactly one matching dated archive tasks path. Missing, multiple, empty or invalid artifacts remain unresolved. PR changed-file history and old PR-head progress cannot prove current completion. Source commit/ref and stale state travel with the evidence.
4. Webhooks preserve merged candidates and trigger targeted reconciliation. Broad repair merges the open list with tracked merged/pending candidates and refreshes those candidates; omission from the open list does not delete them. Scheduled known-PR and manual targeted repair include retained records. Default-branch pushes refresh affected retained progress; feature-branch pushes cannot complete it. Use existing invalidation after successful persistence.
5. Already-removed records can be recovered by explicit targeted repair using repository and PR number, with authoritative author/installation checks even when no previous PR projection exists. Do not scan all historical merged PRs. The initial PR 143 acceptance uses this explicit recovery path if necessary.
6. Add a visible Post-merge lifecycle/filter state, show Merged rather than Draft, retain reconciliation and progress details, and keep merge actions disabled. Include this state in default filters and Clear. Search/repository/status filters still apply. Partition eligible results with retained work first, then run the unchanged selected comparator within each partition for either direction. Update empty-state wording.

## Risks / Trade-offs

- Unresolved declared work can remain indefinitely → show stale/unresolved status and offer targeted repair; do not silently expire obligations. This is narrower than retaining every historical PR.
- Older provider reads can race newer projections → preserve current stale/head guards and add completion-source ordering checks; test with the sibling conflict change.
- More retained records increase aggregate size → preserve the existing size guard and sanitized failure behavior; do not reuse deployment TTL to discard active work.
- Existing unarchived lifecycle specs describe open-only behavior → the retention capability explicitly governs merged candidates; preserve existing open-PR behavior and reconcile overlapping delta blocks before archive so older lifecycle text cannot restore unconditional deletion.

## Migration Plan

Ship with `resolve-aggregate-conflicts` in the single requested PR, declaring both changes. No schema migration or data rewrite is required; reconcile existing candidates and explicitly repair missing targets after exact merged/deployed provenance is verified and applicable operational access is authorized. Rollback to old producer code can delete retained records, so retain provenance and record that risk before any authorized rollback; do not perform rollback as part of this proposal.

## Contract precedence and timing audit

For merged candidates only, `post-merge-work-retention` replaces unconditional closed-target removal, open-only serving and default filters, and global cross-group ordering in the canonical and still-active `reconcile-pr-lifecycle-evidence` contracts. Its explicit single-target recovery extends the existing projected-only target rule; all-PR repair still discovers no unknown history. Existing open-PR lifecycle, sort modes, permissions and non-retention scenarios remain unchanged. The older change belongs to another workflow and is not edited here; archive must reconcile these overlapping blocks in chronological order.

Group 1 is proposal review; Group 2 is required implementation and code review before merge. Only Group 3 genuinely depends on merge/deployment and carries `[post-merge]`. No implementation task is made non-blocking by this designation. Strict validation is separate from this timing audit.
