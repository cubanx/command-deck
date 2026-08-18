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
- Add an inline accordion, a separate deployment-status route, or provider requests for deployment detail.

## Decisions

### Render three read-only lifecycle pills in a compact frame

Every PR card SHALL show Draft, Ready for review, and Mergeable as three compact pills in a native `fieldset` with a `PR Lifecycle` legend that interrupts the top border, with exactly one current stage. The pills stay horizontal unless available width requires wrapping. Completed pills use a green check and `Complete`; the current pill uses a blue half-moon (`◐`) and `Current`; upcoming pills use a slate open circle (`○`) and `Upcoming`. The stage uses the existing dashboard bucket precedence: mergeable first, then draft, otherwise ready for review. This matches the existing filter taxonomy and retains a deterministic state when evidence changes.

An interactive wizard was rejected because users do not advance these states and a PR can regress after a review, check, or mergeability update.

### Keep only exceptional card-level status pills

The lifecycle pills replace normal positive pills. A blocked PR can show at most one warning pill, prioritizing a concise blocker count or the most actionable blocker. It occupies its own spaced row below the lifecycle frame. Linked OpenSpec progress remains a neutral context line. The full underlying signal set is not duplicated as card badges.

### Use one accessible status-detail popover

Hovering or focusing a warning/problem pill or title link opens a shared detail popover. Clicking or tapping pins that same popover so links can be used; a title-link click still follows its GitHub URL. It presents all projected status evidence, exact blockers, failed-workflow links, branch/SHA, snapshot freshness, and linked OpenSpec context. No hover request is made; the popover uses the snapshot already rendered by the dashboard.

Pointer hover opens after a short delay beside its trigger and remains open until explicitly dismissed or another warning/problem pill or title link replaces it. Keyboard focus and click/tap retain the same interaction path for detail links.

The lifecycle pills remain visual only, with the fieldset legend and screen-reader current-stage name preserving their context. The title link and warning/problem pill reuse the shared `status-detail` trigger. Completed, current, and upcoming pills remain distinct through their approved icons, labels, and high-contrast green, blue, and slate theme colors.

An inline collapsible was rejected because it causes variable card heights and undermines list scanning. A separate detail page was rejected because it turns a quick status lookup into navigation.

### Move deployment detail into the header

The header shows the newest existing 48-hour projected deployment as a full detail-style row beside the Command Center brand. Repository, environment, ref, and SHA are joined only when present, preventing duplicate separators. Hovering after the existing short delay, focusing, or clicking/tapping reuses the sticky `status-detail` mechanics to show the newest five deployment rows and their target/log links, with a native `More deployments` disclosure for any remaining newest-first rows. The old large side card is removed, keeping the pull-request list as the primary dashboard surface. No provider request, new projection field, or dependency is introduced.

### Align stage filters with the lifecycle pills

The filter bar exposes the mutually exclusive Draft, Ready for review, and Mergeable stage taxonomy and a distinct attention/blocker filter. Action and check failures remain causes inside the attention filter instead of parallel primary stages.

### Keep configuration and shell contrast operationally legible

Local checkout configuration uses two accessible tables: unresolved states first, then exact `Resolved` states, with each group sorted by full repository name. Existing organization-root and per-repository controls remain in place. A small shared page, surface, text, border, and link palette preserves dark-theme contrast without changing semantic status colors. Operational freshness wins over installability: the browser uses normal HTTP delivery for the shell assets, with no manifest or ongoing service worker. A temporary same-origin `/sw.js` calls `self.skipWaiting()` during installation, then deletes only the known `dcc-shell-v1`, `dcc-shell-v4`, `dcc-shell-v6`, and `dcc-shell-v10` caches and unregisters during activation; it does not register a replacement or delete arbitrary CacheStorage entries. In-page notifications use the standard Notification constructor while the dashboard is open.

## Risks / Trade-offs

- [Compact pills hide individual green gates] → The pinned, keyboard-accessible detail popover retains every projected signal.
- [Mergeability can be stale or unknown] → Preserve the existing freshness/error treatment and show the projected state rather than inferring a live GitHub result.
- [A hover-only interface excludes touch and keyboard users] → Use the same focusable, click/tap-pinnable popover trigger.

## Migration Plan

1. Add the lifecycle, warning, popover, and filter behavior behind the existing snapshot contract.
2. Validate focused rendering and interaction tests, including a PR that regresses from Mergeable.
3. Release through the normal PR path; rollback restores the prior dashboard rendering with no stored-data migration.
