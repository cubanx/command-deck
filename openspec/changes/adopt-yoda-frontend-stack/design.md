## Context

See `proposal.md` for motivation. The current Bun server already exposes a standard `createApp(...).fetch(Request)` boundary and owns authenticated APIs, SSE streams, reconciliation coordinators, merge confirmation, provider projections, and process-lifetime scheduling. The browser is isolated in `src/web/app.ts`, where one render replaces `root.innerHTML`, rebinds handlers, and merges local checkout evidence into server data.

Current Yoda at `02b605ffb2c09be709cf5bd8b173626c126c946b` uses React 19.2.8, Mantine 9.5.0, TanStack Query 5.101.4, TanStack Router 1.170.31, TanStack Start, Vite 8.1.5, Vitest 4.1.10, feature-local query modules, file-based routes, a single Mantine theme boundary, and Testing Library accessibility tests. Its Start/Nitro server, portal shell, release-refresh workflow, broad appearance catalog, and product feature topology serve Yoda-specific runtime needs.

The committed `reconcile-pr-lifecycle-evidence` change governs the current lifecycle and multi-OpenSpec behavior. No committed `align-pr-actions-with-lifecycle` artifact exists on the default branch, so there is nothing to copy or depend on. This change owns the replacement renderer and supersedes any later renderer-specific implementation under that name; it does not supersede canonical lifecycle or merge requirements.

## Goals / Non-Goals

**Goals:**

- Adopt Yoda's proven React, TanStack Router/Query, Mantine, feature-local component/query, Vite, Vitest, Testing Library, and accessibility conventions.
- Keep one frontend state owner and one authenticated snapshot cache while preserving SSE-driven freshness and browser-local checkout configuration.
- Preserve all canonical dashboard, OpenSpec, merge, reconciliation, event-projection, and PWA behavior through focused compatibility tests.
- Correct the root authority mismatch: local checkout evidence is informational, and merge controls follow lifecycle readiness while server action-time checks remain decisive.

**Non-Goals:**

- Replacing the Bun server, MongoDB projections, provider adapters, OAuth/webhook handling, reconciliation coordinators, merge execution, or SSE transport.
- Copying Yoda's product navigation, portal registry, Sentry/Nitro middleware, release-refresh workflow, AEO/finance features, or appearance catalog.
- Adding TanStack Table to card views or adding a second templating system. Mantine's table primitives are sufficient unless measured client-side table state later requires React Table.
- Deploying, changing provider configuration, or mutating production.

## Decisions

### 1. Adopt Yoda's client architecture without moving the server to TanStack Start

Use React, TanStack Router, TanStack Query, Mantine, Vite, Vitest, and Testing Library at the versions established by current Yoda. Keep `createApp(...).fetch` as the sole server runtime and serve the generated client assets through its existing shell boundary.

A full TanStack Start/Nitro cutover was considered. It would require new process-wide initialization, route-precedence, static-asset, SSE-lifetime, coordinator, scheduler, and rollback work even though the frontend behavior does not need a new server. Client-only Vite adopts the Yoda architecture that owns UI composition, routing, data, styling, and tests without putting the stable backend on the operating table.

### 2. Use one feature boundary and file-based routes

Create a small root/provider layer and `src/features/command-center/` for the dashboard view model, query options, SSE bridge, components, and browser-checkout adapter. Use file-based routes for the dashboard and configuration page so route ownership matches Yoda. Do not introduce interfaces, factories, or a general design system for one product.

### 3. Make TanStack Query the authoritative browser data boundary

Define one snapshot query and feature-local mutation options. The route loader prefetches the first snapshot; components consume Query state. One event-stream component invalidates the snapshot query on refresh and reconnect. Reconciliation and merge mutations use existing endpoints, expose sanitized results, then invalidate the same snapshot. No polling or parallel client store is added.

### 4. Separate server projection from local checkout evidence before rendering

The view model consumes authenticated snapshot records without mutating them. IndexedDB and File System Access code remains a browser-only adapter used by configuration and detected-evidence presentation. Local candidates are labeled and displayed separately; they cannot enter lifecycle, attention, merge eligibility, or authoritative `open_specs` calculations. Existing pure filtering, fuzzy search, ordering, lifecycle, and preference behavior is ported once and covered before the old renderer is removed.

Restore the legacy authoritative OpenSpec viewer with one native accessible `details` surface per correlated OpenSpec. Extend the projection with a bounded `active_groups` list containing at most the first two incomplete non-post-merge groups in source order, while retaining and accepting the existing snake_case and camelCase single-group fields as compatibility fallbacks for older records and consumers. Reuse one feature-local presentation component in pull-request cards and status detail, validate external tasks-source links, and keep detected browser-local candidates outside the viewer. Reapply the existing legacy `openspec` and `tasks` classes, emphasize the summary with its active-group title, and add only the missing pointer/hover affordance rather than creating a second accordion style. Suppress detected names already present authoritatively at presentation time without promoting or mutating local evidence.

When older authoritative records retain incomplete totals but lack the newly projected task groups, use those counts to present an explicit incomplete-details-unavailable fallback. Do not infer task names or equate missing detail with completion; ordinary PR reconciliation refreshes the projection.

Keep merge gating and display projection separate: `active_groups` remains the bounded incomplete non-post-merge input to pre-merge readiness, while a bounded `incomplete_groups` field preserves the first two incomplete groups of any phase for the viewer. The frontend prefers display groups and falls back to legacy active-group evidence. When display groups remain but active groups do not, mark the disclosure with a compact `Post-merge` pill instead of adding sentence-length status text; post-merge tasks stay visible without changing lifecycle authority.

### 5. Use Mantine semantics and retain only styling that earns its keep

Add one Mantine provider/theme and use Mantine controls, cards, details/overlays, alerts, inputs, tables, and responsive primitives. Keep the compact Command Center visual language and the minimum existing CSS needed for lifecycle rails and product-specific layout. Yoda's Tailwind layer is not added merely to restate working CSS; add it only if a concrete migrated component becomes simpler than the retained stylesheet. No `dangerouslySetInnerHTML`, Lit, Mustache, or parallel template layer is allowed.

### 6. Prove parity at the cheapest stable boundary

Port browser behavior assertions from string matching to Testing Library role, label, focus, keyboard, status, and visible-state assertions using a small QueryClient/Mantine test provider. Keep server, access, merge, OpenSpec, reconciliation, and PWA integration tests intact. Add a production client-build smoke test and delete legacy renderer tests only after equivalent component coverage exists.

### 7. Keep the dashboard operational, deployment evidence global, and setup controls in Configuration

Keep filtering, ordering, lifecycle, and pull-request actions on the dashboard. Present compact deployment evidence in the shared header so it is neither dashboard content nor configuration. Within its existing trigger, place the `Latest deployment` label and optional status in the first grid row, then span the deployment detail across the second row; preserve the trigger's accessible name, dialog, and focus return behavior. At narrow widths, use one wrapping flex header with equal flexible brand/avatar rails around the auto-width deployment trigger instead of forcing the brand onto a separate row; natural wrapping handles real collisions. Put broad installation synchronization, checkout mappings, notification permission, and reconciliation status on Configuration, where the legacy UI presented setup and operational evidence. Retain the avatar menu shortcut for PR-wide reconciliation and make its dropdown affordance visible beside the avatar. Reuse the existing query mutations and deployment detail component; do not add a second client state boundary or change server endpoints.

Keep Status details and PR-scoped reconciliation on each pull-request card, but omit installation reconciliation there because Configuration already owns installation synchronization. Remove the unused card prop and client mutation wiring while preserving the authenticated server route and Configuration action.

### 8. Make repository and status filtering explicit and one-click

Use visible repository toggle pills as the first filter row so each repository can be included or excluded with one click. Put the eight lifecycle/attention filters in one stock Mantine MultiSelect labeled `Status`, with flat data, built-in pills, and its native clear affordance. Adapt its empty displayed selection to the existing all-lifecycle/all-attention filter state, so `All statuses` means all results without new persisted state or view-model filtering. Keep search, one semantic sort dropdown, and clear in a compact second row, and continue routing every selection through the existing pure dashboard view model rather than adding another filtering implementation.

Keep the existing filtered count immediately after Clear filters in the existing bottom-aligned control row as right-aligned muted `<N> results` status text. Use Mantine's native auto left margin to consume the remaining row space, and retain its small bottom spacing so it aligns with the `sm` controls rather than centering against their labels; do not add count state, a second calculation, CSS, or another wrapper.

Bound the existing Search flex hook to `20rem` on wide screens with a `14rem` minimum, while retaining the existing full-width mobile override. Do not add another layout wrapper or component.

Encode the existing five sort modes and two directions as ten semantic options in one control: closest/furthest from merge, oldest/newest opened, least/most recently updated, least/most complete, and repository A–Z/Z–A. Keep the persisted `{ mode, direction }` object and comparator unchanged so saved preferences remain compatible.

Keep the existing `44px` brand icon and increase only the adjacent brand label to `1.25rem` with a compact line-height. Center the brand contents through the existing navigation flex boundary; do not alter the three-column header grid that independently centers deployment evidence.

## Risks / Trade-offs

- [Large migration can hide regressions] → Cut over by numbered behavior groups; every group starts with focused failing compatibility tests and runs the existing relevant suite.
- [Two renderers can drift during migration] → Keep the parallel period short, never add features to both paths, and delete the legacy path in the final cutover group.
- [SSE invalidation can refetch more than once] → Own one EventSource instance at the route root and assert one invalidation per event/reconnect transition.
- [Local evidence can accidentally regain authority] → Use distinct types/view-model inputs and tests proving detected evidence cannot change lifecycle or merge controls.
- [Vite asset names can break the PWA shell] → Generate a deterministic manifest consumed by the current server and test HTML, MIME types, cache headers, service worker, and production bundle loading.
- [Dependency versions can drift from Yoda] → Record the verified Yoda SHA and adopt its compatible versions in one lockfile change; future upgrades remain ordinary dependency work.
- [Older projected OpenSpecs lack the next group] → Fall back to the existing single `active_group`; the next incomplete group appears after the next authoritative reconciliation populates `active_groups`.
- [Older projected OpenSpecs lack every group] → Preserve their incomplete counts, label task detail unavailable until reconciliation, and never claim completion from missing detail alone.
- [Showing post-merge tasks can accidentally block merge] → Project display-only incomplete groups separately and retain the existing non-post-merge readiness calculation unchanged.

## Migration Plan

1. Add the Yoda-aligned client dependencies, Vite/Vitest browser configuration, providers, test harness, and a production-build smoke test without changing the served UI.
2. Add the file-based route shell, snapshot query/mutations, and single SSE invalidation bridge behind focused data-boundary tests.
3. Port the pure dashboard view model and enforce authoritative/local evidence separation plus lifecycle-ready merge controls.
4. Migrate dashboard cards, lifecycle/status/deployment details, filters, search, repository selection, ordering, reconciliation, merge confirmation, and accessible interaction tests.
5. Migrate configuration, browser checkout discovery, appearance, avatar navigation, responsive behavior, and PWA asset integration.
6. Switch the server shell to the Vite client manifest, remove the HTML-string renderer and superseded tests/CSS, then run the full repository validation.

Rollback before deployment is a source revert to the legacy entrypoint. A deployment, observation window, or production rollback is outside this change and requires a separately authorized release task.

## Operational Gates

- Every numbered group must pass its focused tests, `bun run typecheck`, strict OpenSpec validation, and `git diff --check` before review; the normal `bun run test` suite must include every component/UI test with zero failures.
- The final cutover must additionally pass the full `bun run test` suite with every component/UI test included and zero failures, plus `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun run validate:all` in an authorized local environment.
- No merge, deploy, provider change, production observation, or external mutation is authorized by this change.
