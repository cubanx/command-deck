## 1. Lifecycle contract and regression coverage

- [x] 1.1 Add focused dashboard/view-model tests for Draft, Ready for review, and Mergeable precedence, including a projected regression from Mergeable to an earlier stage.
- [x] 1.2 Add focused tests for one-warning rendering, preserved exact blocker/detail evidence, and absence of default positive-status pills.
- [x] 1.3 Add focused interaction tests for the shared status-detail popover across hover, keyboard focus, click/tap pinning, dismissal, and failed-workflow links.
- [x] 1.4 Add focused filter tests for lifecycle-stage selection and independent attention/blocker filtering.

## 2. Dashboard status presentation

- [x] 2.1 Reuse the existing projected snapshot fields to derive and render compact three-stage PR lifecycle pills.
- [x] 2.2 Replace the lifecycle rail with lifecycle pills, one actionable warning when needed, and neutral linked OpenSpec context.
- [x] 2.3 Implement the shared accessible status-detail popover without adding a GitHub request or a new dependency.
- [x] 2.4 Consolidate the PR filter bar into Draft, Ready for review, Mergeable, and separate attention/blocker controls.

## 3. Verification

- [x] 3.1 Run the focused dashboard tests and `bun run typecheck`.
- [x] 3.2 Run `openspec validate refine-pr-status-pipeline --strict` and `git diff --check`.

## 4. Local demo lifecycle coverage

- [x] 4.1 Extend the local-demo fixture to five representative PRs across Draft, Ready for review, Mergeable, a single blocker, and failed workflow detail.
- [x] 4.2 Add focused fixture and rendering assertions for the demo PR states while retaining temporal regression coverage in the view model.
- [x] 4.3 Run the applicable focused tests, typecheck, strict OpenSpec validation, and `git diff --check`.

## 5. Lifecycle clarity and hover placement

- [x] 5.1 Add focused rendering and interaction coverage for an explicit active lifecycle stage, delayed hover, sticky detail behavior, and retained focus/click/tap detail behavior.
- [x] 5.2 Render the lifecycle pills as a high-contrast three-stage presentation that makes the current state visually and programmatically explicit.
- [x] 5.3 Position hover-opened status detail beside its trigger after a short delay while preserving viewport safety and pinned interactive detail behavior.
- [x] 5.4 Run the applicable focused tests, typecheck, strict OpenSpec validation, and `git diff --check`.

## 6. Superseded lifecycle treatment

- [x] 6.1 Add focused rendering assertions for the prior two-row lifecycle treatment.
- [x] 6.2 Apply the prior label-and-track presentation while retaining its accessible name and interaction behavior.
- [x] 6.3 Apply explicit high-contrast completed, current, future, connector, and check styling in light and dark themes.
- [x] 6.4 Run the applicable focused tests, typecheck, strict OpenSpec validation, and `git diff --check`.

## 7. Configuration clarity and shell contrast

- [x] 7.1 Add focused static shell contracts for cache versions, accessible checkout tables, ordering, empty states, and shared contrast tokens.
- [x] 7.2 Replace local-checkout lists with sorted Unresolved and Resolved tables while retaining existing checkout controls.
- [x] 7.3 Add shared light and dark palette tokens for common surfaces, controls, borders, links, and lifecycle contrast without changing semantic status colors.
- [x] 7.4 Advance the cached shell application asset and run focused tests, typecheck, strict OpenSpec validation, and `git diff --check`.

## 8. Sticky status detail dismissal

- [x] 8.1 Add focused interaction coverage for sticky pointer-leave behavior and replacement by another trigger.
- [x] 8.2 Keep hover-opened status detail open until explicit dismissal or replacement without changing the hover delay, pinning, or accessibility behavior.
- [x] 8.3 Run the applicable focused tests, typecheck, strict OpenSpec validation, and `git diff --check`.

## 9. Lifecycle pill replacement

- [x] 9.1 Add focused rendering and static-shell assertions for the approved completed, current, and upcoming lifecycle pills, independent colors, and wrapping.
- [x] 9.2 Replace the two-row lifecycle rail with the approved three-pill presentation while preserving the shared status-detail trigger and interactions.
- [x] 9.3 Run the focused dashboard tests, typecheck, strict OpenSpec validation, and `git diff --check`.

## 10. PR card layout refinement

- [x] 10.1 Add focused rendering assertions for title-link status detail access, the titled horizontal lifecycle frame, and the separate warning row.
- [x] 10.2 Reuse the shared status-detail trigger on the PR title link, frame the existing lifecycle control, and move the existing warning into its own row.
- [x] 10.3 Run focused dashboard and static-shell tests, typecheck, strict OpenSpec validation, and `git diff --check`.

## 11. Lifecycle frame spacing

- [x] 11.1 Add focused rendering and static-shell assertions for the lifecycle heading above horizontal pills and spaced OpenSpec context.
- [x] 11.2 Stack the lifecycle frame heading above its wrapping pill row and add spacing below PR status.
- [x] 11.3 Run focused dashboard and static-shell tests, typecheck, strict OpenSpec validation, and `git diff --check`.

## 12. Native lifecycle fieldset

- [x] 12.1 Add focused rendering and static-shell assertions for a native lifecycle fieldset and legend.
- [x] 12.2 Replace the lifecycle frame wrapper with a native fieldset and legend and reset its browser defaults.
- [x] 12.3 Run focused dashboard and static-shell tests, typecheck, strict OpenSpec validation, and `git diff --check`.

## 14. Compact deployment detail

- [x] 14.1 Add focused runtime and static-shell assertions for the newest projected header trigger, removed deployment side card, and advanced cache keys.
- [x] 14.2 Reuse the existing sticky status-detail mechanics for the existing 48-hour deployment rows and links, and remove the large deployment side card without adding a provider request or dependency.
- [x] 14.3 Rebuild the browser asset and run focused tests, typecheck, strict OpenSpec validation, and `git diff --check`.

## 15. Deployment-header refinement

- [x] 15.1 Add focused rendering coverage for the full latest-deployment row, omission of empty segment separators, and default-five deployment detail disclosure.
- [x] 15.2 Replace the compact header pill with the detail-style row, join only present repository/environment/ref/SHA segments, and retain sticky detail links with native `More deployments` disclosure.
- [x] 15.3 Rebuild and run focused tests, typecheck, strict OpenSpec validation, and `git diff --check`.

## 16. Deployment-header visual tuning

- [x] 16.1 Add static shell coverage for the revised deployment-header dimensions and cache keys.
- [x] 16.2 Widen and enlarge the latest-deployment row, add vertical breathing room, and retain its data and interaction behavior.
- [x] 16.3 Run focused tests, typecheck, strict OpenSpec validation, and `git diff --check`.

## 17. Fresh operational shell

- [x] 17.1 Add focused static-shell assertions that service-worker and manifest routes are absent and shell assets use normal HTTP URLs.
- [x] 17.2 Remove the service worker, manifest, installability shell routes and references, use the standard in-page Notification API fallback, and record the `installable-pwa` requirement change.
- [x] 17.3 Run focused tests, typecheck, strict OpenSpec validation, and `git diff --check`.

## 18. One-time service-worker retirement

- [x] 18.1 Add focused route and static assertions for the retirement response, `skipWaiting`, its four-cache cleanup scope, self-unregistration, and absence of registration or manifest behavior.
- [x] 18.2 Serve the bounded same-origin `/sw.js` retirement handler that activates immediately before cleanup and unregistration, without restoring PWA registration, installability, or broad CacheStorage deletion.
- [x] 18.3 Run focused tests, typecheck, strict OpenSpec validation, and `git diff --check`.

## 19. Review corrections

- [x] 19.1 Add focused lifecycle/filter, shell freshness, and theme-token regression coverage.
- [x] 19.2 Apply draft-first lifecycle bucketing, fresh shell headers, and theme semantic tokens.
- [x] 19.3 Run focused tests, typecheck, strict OpenSpec validation, and `git diff --check`.
