## Why

PR cards expose several overlapping status pills, which makes it difficult to scan the intended lifecycle: Draft, Ready for review, then Mergeable. Supporting GitHub evidence should remain available without competing with that primary pipeline.

## What Changes

- Replace the always-visible collection of PR status pills with a read-only three-stage status rail: Draft, Ready for review, and Mergeable.
- Show one primary state from that pipeline for every PR, including movement back to an earlier state when current projected GitHub evidence changes.
- Remove default positive-status pills; show at most one actionable warning pill for a blocked PR.
- Add an accessible, shared status-detail popover, opened by hover or keyboard focus and pinnable by click/tap, containing the supporting projected GitHub evidence, blockers, failed-workflow links, branch/SHA, freshness, and linked OpenSpec context.
- Consolidate PR stage filters into the same Draft, Ready for review, and Mergeable taxonomy, with a separate attention/blocker filter.
- Reuse the existing snapshot/projection data; do not add an on-hover GitHub API call.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `command-center-dashboard`: Present each authored PR's lifecycle stage and supporting projected evidence with a compact, accessible dashboard status treatment and aligned filters.

## Impact

- Affected UI and dashboard view-model behavior in the command-center web application.
- Focused dashboard UI and access/view-model tests.
- No new dependencies, GitHub App permissions, provider polling, merge execution, deployment, or production operations.
