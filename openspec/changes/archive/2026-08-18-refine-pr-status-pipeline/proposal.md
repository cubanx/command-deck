## Why

PR cards expose several overlapping status pills, which makes it difficult to scan the intended lifecycle: Draft, Ready for review, then Mergeable. Supporting GitHub evidence should remain available without competing with that primary pipeline.

## What Changes

- Present the three read-only lifecycle pills in a native `fieldset` with a compact `PR Lifecycle` legend that interrupts its top border, with a separate warning row when needed.
- Show one primary state from that pipeline for every PR, including movement back to an earlier state when current projected GitHub evidence changes.
- Remove default positive-status pills; show at most one actionable warning pill for a blocked PR.
- Add an accessible, shared status-detail popover, opened by hover or keyboard focus on a warning/problem pill or PR title link and pinnable by click/tap, remaining open until explicitly dismissed or replaced by another trigger, and containing the supporting projected GitHub evidence, blockers, failed-workflow links, branch/SHA, freshness, and linked OpenSpec context.
- Consolidate PR stage filters into the same Draft, Ready for review, and Mergeable taxonomy, with a separate attention/blocker filter.
- Reuse the existing snapshot/projection data; do not add an on-hover GitHub API call or intercept title-link navigation.
- Replace the compact deployment pill with the newest projected deployment's full header row; reuse the sticky status-detail interaction to show the newest five existing 48-hour rows first, with a native disclosure for the remainder, and their links.
- Present local checkout configuration as sorted unresolved and resolved repository tables, deliver dashboard shell assets freshly through normal HTTP `Cache-Control: no-cache`, and temporarily retire prior same-origin service-worker registrations without restoring PWA behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `command-center-dashboard`: Present each authored PR's lifecycle stage and supporting projected evidence with a compact, accessible dashboard status treatment and aligned filters.
- `installable-pwa`: Remove installability and service-worker shell caching in favor of fresh operational HTTP delivery.

## Impact

- Affected UI and dashboard view-model behavior in the command-center web application.
- Focused dashboard UI and access/view-model tests.
- No new dependencies, GitHub App permissions, provider polling, merge execution, deployment, or production operations.
