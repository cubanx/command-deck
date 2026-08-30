## Why

Command Center's browser UI is a single hand-written HTML-string renderer that replaces `innerHTML`, rebinds events after every refresh, and mixes browser-local OpenSpec evidence into authoritative lifecycle state. Yoda now has a proven React, TanStack, Mantine, and Testing Library architecture; adopting its coherent frontend boundary removes the mismatch without changing Command Center's server and projection contracts.

## What Changes

- Replace the HTML-string/`innerHTML` renderer with a React-owned UI using the client architecture and conventions verified in current Yoda: React, TanStack Router/Query, Mantine, Vite, and Vitest with Testing Library.
- Move dashboard reads and mutations behind feature-local query options, route-prefetch the initial snapshot, and translate the existing SSE signal into query invalidation instead of polling.
- Rebuild the dashboard, lifecycle, filtering, ordering, status details, reconciliation, configuration, and merge controls as accessible Mantine-backed components while preserving current behavior.
- Keep browser checkout discovery as local informational state, but prevent it from changing server-authoritative lifecycle, merge eligibility, or PR-owned OpenSpec associations.
- Preserve the existing authenticated server APIs, event projection, PWA, provider reconciliation, and action-time merge authority; migrate their browser consumers rather than replacing those contracts.
- Carry forward the committed lifecycle requirements from `reconcile-pr-lifecycle-evidence`. No committed `align-pr-actions-with-lifecycle` change exists on the default branch; any later renderer-specific UI work under that name is superseded by this migration, while lifecycle and merge requirements remain authoritative.

## Capabilities

### New Capabilities

- `frontend-architecture`: Defines the Yoda-aligned React/TanStack/Mantine frontend boundary, accessible component behavior, SSE-driven data refresh, and separation of browser-local evidence from authoritative dashboard state.

### Modified Capabilities

None. Existing dashboard, OpenSpec progress, PWA, merge, event projection, and reconciliation requirements remain behaviorally authoritative and are preserved by the migration.

## Impact

- Replaces `src/web/app.ts`, the browser build entrypoint, and most renderer-specific CSS/tests with React feature, route, provider, and test-harness modules.
- Adds the Yoda-established client packages at versions compatible with the current Yoda lockfile and updates the browser build/test configuration.
- Retains `src/access.ts`, `src/merge.ts`, provider projections, MongoDB boundaries, authenticated server routes, `/api/snapshot`, `/events`, merge/reconciliation endpoints, and installable-shell assets.
- Requires a sequenced cutover with compatibility tests before deleting the legacy renderer; no deployment or external mutation is part of this change.
