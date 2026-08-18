## Context

The dashboard already receives a bounded, user-scoped PR snapshot containing draft state, mergeability, review/check/workflow evidence, optional bot-review evidence, blockers, freshness, and linked OpenSpec progress. The card renders those overlapping signals as several pills. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**

- Make the projected Draft → Ready for review → Mergeable lifecycle immediately scannable.
- Preserve all currently projected supporting evidence without an additional GitHub request.
- Provide the same details to pointer, keyboard, and touch users.

**Non-Goals:**

- Change GitHub projection fields, reconciliation cadence, permissions, or merge execution.
- Treat the lifecycle as irreversible progress; incoming GitHub evidence can move a PR backward.
- Add an inline accordion or a separate deployment-status treatment.

## Decisions

### Render a three-stage read-only lifecycle rail

Every PR card SHALL show Draft, Ready for review, and Mergeable as one compact rail, with exactly one current stage. The stage uses the existing dashboard bucket precedence: mergeable first, then draft, otherwise ready for review. This matches the existing filter taxonomy and retains a deterministic state when evidence changes.

An interactive wizard was rejected because users do not advance these states and a PR can regress after a review, check, or mergeability update.

### Keep only exceptional card-level status pills

The rail replaces normal positive pills. A blocked PR can show at most one warning pill, prioritizing a concise blocker count or the most actionable blocker. Linked OpenSpec progress remains a neutral context line. The full underlying signal set is not duplicated as card badges.

### Use one accessible status-detail popover

Hovering or focusing the lifecycle rail or warning pill opens a shared detail popover. Clicking or tapping pins that same popover so links can be used. It presents all projected status evidence, exact blockers, failed-workflow links, branch/SHA, snapshot freshness, and linked OpenSpec context. No hover request is made; the popover uses the snapshot already rendered by the dashboard.

An inline collapsible was rejected because it causes variable card heights and undermines list scanning. A separate detail page was rejected because it turns a quick status lookup into navigation.

### Align stage filters with the rail

The filter bar exposes the mutually exclusive Draft, Ready for review, and Mergeable stage taxonomy and a distinct attention/blocker filter. Action and check failures remain causes inside the attention filter instead of parallel primary stages.

## Risks / Trade-offs

- [A compact rail hides individual green gates] → The pinned, keyboard-accessible detail popover retains every projected signal.
- [Mergeability can be stale or unknown] → Preserve the existing freshness/error treatment and show the projected state rather than inferring a live GitHub result.
- [A hover-only interface excludes touch and keyboard users] → Use the same focusable, click/tap-pinnable popover trigger.

## Migration Plan

1. Add the lifecycle, warning, popover, and filter behavior behind the existing snapshot contract.
2. Validate focused rendering and interaction tests, including a PR that regresses from Mergeable.
3. Release through the normal PR path; rollback restores the prior dashboard rendering with no stored-data migration.
