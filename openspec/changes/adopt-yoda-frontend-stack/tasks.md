## 1. Establish the Yoda-aligned frontend baseline

- [x] 1.1 Add a focused failing component-shell test that asserts the root providers render an accessible Command Center main surface, and verify `bun run test -- test/frontend-shell.test.tsx` fails before the runtime exists.
- [x] 1.2 Add the verified Yoda-compatible React, TanStack Router/Query, Mantine, Vite, Vitest, and Testing Library dependencies plus the minimal root providers and test harness, and verify `bun run test -- test/frontend-shell.test.tsx` passes without changing the served legacy UI.
- [x] 1.3 Add a production client-build smoke check for the new entrypoint and verify it emits loadable browser assets without using HTML-string injection or a parallel template layer.
- [x] 1.4 Run `bun run typecheck`, `bun run test -- test/frontend-shell.test.tsx test/web-runtime.test.ts test/pr-view.test.ts test/web-build.test.ts`, `openspec validate adopt-yoda-frontend-stack --strict`, and `git diff --check`.

## 2. Add the routed snapshot and event boundary

- [x] 2.1 Add failing tests for route-prefetched snapshot loading, one Query cache, event-driven invalidation, reconnect refresh, preserved local preferences, and no healthy-stream polling; verify the focused tests fail before implementation.
- [x] 2.2 Implement the file-based dashboard/configuration routes, feature-local snapshot query and mutation options, and one root EventSource bridge over the existing `/api/snapshot` and `/events` contracts; verify the focused route/query tests pass.
- [x] 2.3 Verify existing authenticated snapshot, SSE, reconciliation, merge, OAuth, and webhook server tests still pass unchanged.
- [x] 2.4 Run `bun run typecheck`, the focused frontend/server tests declared by this group, `openspec validate adopt-yoda-frontend-stack --strict`, and `git diff --check`.

## 3. Port the dashboard view model and authority gates

- [x] 3.1 Port focused failing tests for lifecycle precedence, attention, filters, fuzzy search, repository selection, exclusive status buckets, ordering preferences, multi-OpenSpec presentation, and lifecycle-ready merge controls from string assertions to view-model assertions.
- [x] 3.2 Implement the minimum pure dashboard view model by reusing the current algorithms once, and verify the ported behavior tests pass.
- [x] 3.3 Add failing tests proving browser-local detected OpenSpecs remain separate from authoritative `open_specs` and cannot change lifecycle, attention, or merge availability; then implement the separation and verify the tests pass.
- [x] 3.4 Verify the existing access, OpenSpec projection, and action-time merge suites still pass, then run `bun run typecheck`, `openspec validate adopt-yoda-frontend-stack --strict`, and `git diff --check`.

## 4. Migrate the operational dashboard components

- [x] 4.1 Add Testing Library failures for accessible dashboard cards, lifecycle rails, status/deployment detail focus and dismissal, filters, search, repository selection, ordering, empty/error states, and narrow-viewport semantics.
- [x] 4.2 Implement the Mantine-backed dashboard, lifecycle, OpenSpec, status, deployment, filter, search, and ordering components and verify the focused accessibility and parity tests pass.
- [x] 4.3 Add failing tests for reconciliation and exact-head merge controls, sanitized status announcements, lifecycle fail-closed visibility, confirmation, focus return, and post-mutation refresh; implement the components against existing endpoints and verify the tests pass.
- [x] 4.4 Run `bun run typecheck`, all focused component tests plus existing reconciliation/merge tests, `openspec validate adopt-yoda-frontend-stack --strict`, and `git diff --check`.

## 5. Migrate configuration, local checkout, appearance, and PWA behavior

- [x] 5.1 Add failing component tests for avatar navigation, the configuration route, IndexedDB/File System Access checkout setup, local-evidence labeling, appearance persistence, and responsive navigation.
- [x] 5.2 Implement the Mantine-backed configuration and navigation components while preserving the existing browser checkout adapter and preferences; verify the focused tests pass and local evidence remains non-authoritative.
- [x] 5.3 Update the client asset manifest integration and verify the HTML shell, icons, manifest, service worker, content types, cache headers, and installed-app loading through existing PWA/server tests.
- [x] 5.4 Run `bun run typecheck`, all focused configuration/PWA tests, `openspec validate adopt-yoda-frontend-stack --strict`, and `git diff --check`.

## 6. Cut over and remove the legacy renderer

- [x] 6.1 Switch the served shell to the production Vite client assets and verify browser-build and server integration tests load the React application through the existing `createApp(...).fetch` runtime.
- [x] 6.2 Delete the superseded HTML-string renderer, render-bound event wiring, obsolete build path, redundant CSS, and string-markup tests only after equivalent component coverage passes; verify no application-owned `innerHTML`, Lit, Mustache, or parallel renderer remains.
- [x] 6.3 Run `bun run typecheck`, the full `bun run test` suite with every component/UI test included and zero failures, `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun run validate:all`, `openspec validate adopt-yoda-frontend-stack --strict`, and `git diff --check`.
- [x] 6.4 Record the exact validation results and remaining deployment/observation gates; stop without commit, push, PR, deploy, production access, or external mutation.
- [x] 6.5 Keep development frontend assets live-rebuilt and refresh the development manifest after hashed output changes, while production assets remain stably cached; verify focused and full gates.

## 7. Incorporate configuration and navigation review feedback

- [x] 7.1 Add focused failing component tests proving the dashboard omits deployment and global reconciliation controls; Configuration presents deployment detail, broad installation sync, PR-wide reconciliation with announced results, repository checkout mapping results, and notification permission; and the avatar menu exposes a chevron plus PR-wide reconciliation.
- [x] 7.2 Move the existing deployment and reconciliation components into Configuration, restore the compact repository mapping/result presentation and native notification affordance, and add the avatar-menu shortcut without changing server contracts or adding parallel state.
- [x] 7.3 Run focused dashboard/configuration/navigation tests, `bun run typecheck`, `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun run validate:all`, `bun run test:e2e`, `openspec validate adopt-yoda-frontend-stack --strict`, and `git diff --check`; record the exact results and stop without committing.

## 8. Correct shared-header placement from final review

- [x] 8.1 Add focused failing tests proving deployment evidence is present in the shared navigation header, absent from dashboard and Configuration content, and the avatar chevron renders beside rather than beneath the avatar.
- [x] 8.2 Move the existing deployment summary/detail into the shared navigation component and align the avatar/chevron horizontally without changing snapshot ownership, endpoint contracts, or menu behavior.
- [x] 8.3 Run focused navigation/configuration/dashboard tests, `bun run typecheck`, `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun run validate:all`, `bun run test:e2e`, `openspec validate adopt-yoda-frontend-stack --strict`, and `git diff --check`; record exact results and stop without committing.

## 9. Polish shared-header alignment from final review

- [x] 9.1 Add focused assertions for an independently centered deployment summary and a borderless avatar menu target that retains accessible focus treatment.
- [x] 9.2 Apply the minimum shared-header layout and avatar-button styling changes without changing navigation behavior or responsive wrapping.
- [x] 9.3 Run focused navigation tests, `bun run typecheck`, `openspec validate adopt-yoda-frontend-stack --strict`, and `git diff --check`; stop without committing.

## 10. Restore lifecycle wizard visual parity

- [x] 10.1 Add focused component assertions for the bordered PR Lifecycle group, exact ordered Draft/OpenSpec ready/Ready for review/Reviewing/Mergeable pills, Complete/Current/Upcoming state text and icons, and screen-reader current-stage summary.
- [x] 10.2 Replace the plain lifecycle list markup with the existing legacy-compatible semantic fieldset and pill classes while reusing the current lifecycle view-model output unchanged.
- [x] 10.3 Run focused dashboard and view-model tests, `bun run typecheck`, `bun run test:e2e`, `openspec validate adopt-yoda-frontend-stack --strict`, and `git diff --check`; stop without committing.

## 11. Organize repository and status filtering

- [x] 11.1 Add focused tests for visible one-click repository pills; the Status dropdown's eight multi-select options; checked, indeterminate, and unchecked All states; `Status: All`, `Status (N)`, and `Status: None` labels; zero-selection results; clear behavior; and existing search/sort/filter composition.
- [x] 11.2 Implement the two-row filter bar by reusing the current view state and pure filtering logic, preserving `null` repository wildcard and omitted-status compatibility while making the dashboard's explicit empty status selection match zero pull requests.
- [x] 11.3 Run focused dashboard/view-model/route tests, `bun run typecheck`, `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun run validate:all`, `bun run test:e2e`, `openspec validate adopt-yoda-frontend-stack --strict`, and `git diff --check`; record exact results and stop without committing.

## 12. Mark selected repository pills

- [x] 12.1 Add a focused component assertion that selected repository pills show an accessibility-neutral checkmark while unselected pills do not and accessible names remain unchanged.
- [x] 12.2 Render the checkmark inside the existing repository pill without adding a component, stylesheet, dependency, or parallel selection state.
- [x] 12.3 Run the focused dashboard test, `bun run typecheck`, `bun run test:e2e`, `openspec validate adopt-yoda-frontend-stack --strict`, and `git diff --check`; stop without committing.

## 13. Remove duplicate dashboard copy and place the result count

- [x] 13.1 Add focused assertions that the brand omits its explanatory tagline, the dashboard omits duplicate signed-in text, and the filtered pull-request count follows the filter card.
- [x] 13.2 Remove the two redundant text nodes and move the existing filtered count immediately below `DashboardFilters` without changing its calculation or authentication behavior.
- [x] 13.3 Run focused navigation/dashboard/route tests, `bun run typecheck`, `bun run test:e2e`, `openspec validate adopt-yoda-frontend-stack --strict`, and `git diff --check`; stop without committing.

## 14. Space the selected repository marker

- [x] 14.1 Add a focused assertion that the accessibility-neutral selected marker includes visible separation before the repository name, then implement the minimum markup-only fix without CSS or a new component.
- [x] 14.2 Run the focused dashboard test, `bun run typecheck`, `openspec validate adopt-yoda-frontend-stack --strict`, and `git diff --check`; stop without committing.
