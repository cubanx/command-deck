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

## 15. Integrate the filtered result count

- [x] 15.1 Add a focused failing assertion that the existing filtered count renders as muted `<N> results` status text aligned at the bottom-right inside the filter card.
- [x] 15.2 Pass the existing derived item count into `DashboardFilters`, render it once inside the existing filter card, and remove the orphaned external count without adding state, calculation, CSS, or a component.
- [x] 15.3 Run the focused dashboard test, `bun run typecheck`, `openspec validate adopt-yoda-frontend-stack --strict`, and `git diff --check`; stop without committing.

## 16. Align the filtered result count left

- [x] 16.1 Update the focused result-count assertion from bottom-right to bottom-left alignment.
- [x] 16.2 Change only the existing Mantine text alignment prop, then run the focused dashboard test, `bun run typecheck`, strict OpenSpec validation, and `git diff --check`; stop without committing.

## 17. Reduce the search field width

- [x] 17.1 Add a focused stylesheet contract proving the existing Search flex hook is bounded to `20rem` with a `14rem` minimum on wide screens while its mobile rule retains `flex-basis: 100%`.
- [x] 17.2 Update only the existing Search flex rule, then run the focused quality-contract and dashboard tests, `bun run typecheck`, strict OpenSpec validation, and `git diff --check`; stop without committing.

## 18. Combine sort mode and direction

- [x] 18.1 Add focused component, route-preference, and fixture-journey failures proving one Sort pull requests dropdown exposes all ten semantic orderings, restores existing persisted `{ mode, direction }` values, drives every current ordering, and removes the separate Sort direction control.
- [x] 18.2 Encode and decode the existing sort preference in the single control while leaving persistence and comparator logic unchanged; remove only the obsolete direction markup and styling.
- [x] 18.3 Run focused dashboard, route, sort-preference, and E2E tests, `bun run typecheck`, strict OpenSpec validation, and `git diff --check`; stop without committing.

## 19. Increase and center the brand label

- [x] 19.1 Add a focused stylesheet contract proving the existing `44px` icon remains unchanged while the navigation-scoped brand label uses `1.25rem`, a compact line-height, and vertically centered flex alignment.
- [x] 19.2 Update only the existing brand styling, then run focused quality-contract and navigation tests, `bun run typecheck`, strict OpenSpec validation, and `git diff --check`; stop without committing.

## 20. Place the result total with filter actions

- [x] 20.1 Add a focused failing assertion that the muted `<N> results` status is inside the filter row immediately after Clear filters while retaining accessible status semantics.
- [x] 20.2 Move the existing text node into the existing wrapping group without new state, calculation, CSS, or another wrapper, then run the focused dashboard test, `bun run typecheck`, strict OpenSpec validation, and `git diff --check`; stop without committing.

## 21. Vertically center the result total

- [x] 21.1 Add a focused failing assertion that the existing results status self-centers vertically without changing the filter row's bottom alignment.
- [x] 21.2 Apply only the existing Mantine text style prop, then run the focused dashboard test, `bun run typecheck`, strict OpenSpec validation, and `git diff --check`; stop without committing.

## 22. Remove installation reconciliation from pull-request cards

- [x] 22.1 Add focused failing assertions that pull-request cards retain Status details and Reconcile PR but omit Reconcile installation, while Configuration retains installation synchronization.
- [x] 22.2 Delete the card-level installation callback and unused client mutation wiring without changing server reconciliation routes or Configuration behavior.
- [x] 22.3 Run focused dashboard, configuration, and snapshot-mutation tests, `bun run typecheck`, strict OpenSpec validation, and `git diff --check`; stop without committing.

## 23. Align the result total with the filter controls

- [x] 23.1 Replace the failed self-centering assertion with a focused failing contract that keeps the results status after Clear filters and offsets it within the existing bottom-aligned row.
- [x] 23.2 Replace only the existing text alignment style with Mantine's native small spacing prop, then run the focused dashboard test, `bun run typecheck`, strict OpenSpec validation, and `git diff --check`; stop without committing.

## 24. Push the result total right

- [x] 24.1 Add a focused failing assertion that the existing results status consumes the remaining filter-row space while retaining its placement after Clear filters and vertical alignment.
- [x] 24.2 Add only Mantine's native auto left-margin prop to the existing status text, then run the focused dashboard test, `bun run typecheck`, strict OpenSpec validation, and `git diff --check`; stop without committing.

## 25. Restore the authoritative OpenSpec task viewer

- [x] 25.1 Add focused failing parser, projection, and persistence tests for an ordered maximum of two incomplete non-post-merge groups, the existing single-group compatibility field, all-complete behavior, and old records that lack the new field.
- [x] 25.2 Extend the existing task parser and authoritative OpenSpec projection with the bounded group list while preserving lifecycle/readiness calculations and the existing `active_group` contract.
- [x] 25.3 Add focused failing component tests for one accessible expandable viewer per authoritative OpenSpec, current-plus-next group titles and disabled task completion state, multiple OpenSpecs, safe tasks-source links, all-complete fallback, and separation from detected browser-local candidates.
- [x] 25.4 Implement one reused native-details OpenSpec presentation component for pull-request cards and status detail, then run the focused OpenSpec/dashboard/view-model tests, `bun run typecheck`, `bun run test:e2e`, strict OpenSpec validation, and `git diff --check`; stop without committing.

## 26. Close OpenSpec viewer compatibility and accessibility gaps

- [x] 26.1 Add focused failing tests for legacy camelCase group fields, malformed new-group fallback to valid legacy evidence, accessible task-checkbox names, and repeated source-authored group/task text.
- [x] 26.2 Normalize both naming conventions without silently swallowing malformed JSON, associate every disabled checkbox with its task text, use source-order-safe React keys, then rerun the focused OpenSpec/dashboard/view-model tests, `bun run typecheck`, `bun run test:e2e`, strict OpenSpec validation, and `git diff --check`; stop without committing.

## 27. Clarify authoritative OpenSpec disclosures

- [x] 27.1 Add focused failing component and view-model tests that suppress detected names already shown authoritatively while retaining unrelated detected candidates, and assert the OpenSpec disclosure exposes the existing bordered/task classes plus an emphasized active-group summary.
- [x] 27.2 Reuse the existing legacy OpenSpec/task styles, add only the missing pointer/hover summary affordance, and filter duplicate detected labels at presentation time without changing authoritative association or lifecycle state.
- [x] 27.3 Run the focused dashboard/view-model/quality-contract tests, `bun run typecheck`, `bun run test:e2e`, strict OpenSpec validation, and `git diff --check`; stop without committing.

## 28. Preserve incomplete legacy OpenSpec evidence

- [x] 28.1 Add a focused failing component test for authoritative `5/8` evidence without task groups, while retaining the existing genuine all-complete case.
- [x] 28.2 Use the existing authoritative counts in the shared OpenSpec viewer to distinguish missing incomplete task details from true completion without inventing task content or changing projection authority.
- [x] 28.3 Run the focused dashboard test, `bun run typecheck`, `bun run test:e2e`, strict OpenSpec validation, and `git diff --check`; stop without committing.

## 29. Display post-merge OpenSpec tasks without changing readiness

- [x] 29.1 Add focused failing parser, projection, persistence, and component tests for an OpenSpec whose remaining unchecked tasks are all in a `[post-merge]` group; assert the summary says `Post-merge remaining`, those tasks are displayed, and pre-merge readiness remains true.
- [x] 29.2 Project a bounded display-only incomplete-group field from both task parsers, retain the existing filtered active-group readiness contract, and prefer the display field in the shared OpenSpec viewer with legacy fallbacks and the explicit post-merge summary state.
- [x] 29.3 Run the focused OpenSpec, GitHub-client, view-model, and dashboard tests, `bun run typecheck`, `bun run test:e2e`, strict OpenSpec validation, and `git diff --check`; stop without committing.

## 30. Compact post-merge presentation

- [x] 30.1 Add a focused failing component assertion that post-merge-only work uses a compact `Post-merge` pill beside the ordinary OpenSpec name and progress instead of sentence-length summary text.
- [x] 30.2 Reuse Mantine's existing badge primitive for that marker without changing task projection, disclosure behavior, or readiness state.
- [x] 30.3 Run the focused dashboard test, `bun run typecheck`, strict OpenSpec validation, and `git diff --check`; stop without committing.

## 31. Contain narrow-card blockers and align the post-merge pill

- [x] 31.1 Add focused failing component and stylesheet-contract assertions for a contained blocker list plus visible inline spacing and vertical alignment on the existing `Post-merge` pill.
- [x] 31.2 Apply the minimum blocker-list class and existing Mantine/CSS presentation hooks without changing blocker content, disclosure behavior, or card state.
- [x] 31.3 Run focused dashboard and stylesheet-contract tests, `bun run typecheck`, `bun run test:e2e`, strict OpenSpec validation, and `git diff --check`; stop without committing.

## 32. Compact pull-request actions

- [x] 32.1 Add focused failing component assertions that cards omit `Status details`, render `Reconcile PR` in the header controls beside the stage badge, preserve reconciliation behavior, and omit an empty footer action row.
- [x] 32.2 Remove the card-only status-detail state/dialog path and move the existing reconciliation button without changing its mutation, busy, announcement, failure, or focus contracts.
- [x] 32.3 Run focused dashboard tests, `bun run typecheck`, `bun run test:e2e`, strict OpenSpec validation, and `git diff --check`; stop without committing.

## 33. Distribute compact card-header controls

- [x] 33.1 Add a focused failing component assertion that `Reconcile PR` uses native auto inline margin after the existing title and stage pill while the header retains wrapping.
- [x] 33.2 Flatten the existing header controls and apply only Mantine's native auto-margin prop without new CSS, state, or wrappers.
- [x] 33.3 Run the focused dashboard test, `bun run typecheck`, strict OpenSpec validation, and `git diff --check`; stop without committing.

## 34. Consolidate pull-request actions into a title menu

- [x] 34.1 Add focused failing component and E2E assertions for an accessible dropdown-style action trigger beside the PR title, no stage pill, menu-based reconciliation, and conditional exact-head native Merge submission.
- [x] 34.2 Reuse Mantine Menu and the existing reconcile/native-form contracts, returning focus to the menu trigger after reconciliation without adding parallel mutation state or changing merge eligibility.
- [x] 34.3 Run focused dashboard tests, `bun run typecheck`, `bun run test:e2e` with 100% passing, strict OpenSpec validation, and `git diff --check`; stop without committing.

## 35. Make the PR title the action menu

- [x] 35.1 Add focused failing component and E2E assertions that the PR title itself is the large dropdown trigger, no direct title link or visible `Actions` button remains, and the ordered menu contains `Reconcile PR`, conditional `Merge`, then safe `Open PR` with a new-window icon.
- [x] 35.2 Replace only the menu-target presentation and add the safe final PR-link item while preserving reconciliation, native exact-head merge, focus, and responsive behavior.
- [x] 35.3 Run focused dashboard and stylesheet-contract tests, `bun run typecheck`, `bun run test:e2e` with 100% passing, strict OpenSpec validation, and `git diff --check`; stop without committing.

## 36. Align the title-menu chevron

- [x] 36.1 Add focused failing component and stylesheet-contract assertions that the entire title remains one menu button while title text may wrap and its chevron stays a vertically centered, non-shrinking cue.
- [x] 36.2 Add only the minimum text/cue spans and flex alignment to the existing title trigger without changing its accessible name or menu behavior.
- [x] 36.3 Run focused dashboard and stylesheet-contract tests, `bun run typecheck`, strict OpenSpec validation, and `git diff --check`; stop without committing.

## 37. Anchor the title menu to its chevron

- [x] 37.1 Add a focused failing component assertion that the title menu uses Mantine's lower-right placement beneath its chevron.
- [x] 37.2 Set only the existing Menu placement prop without changing trigger size, menu contents, portal ownership, or action behavior.
- [x] 37.3 Run the focused dashboard test, `bun run typecheck`, strict OpenSpec validation, and `git diff --check`; stop without committing.

## 38. Use the stock Status multi-select

- [x] 38.1 Replace the custom Status menu assertions with focused MultiSelect tests for its label, placeholder, eight flat options, pills, removal, native clear behavior, filter composition, and Clear filters restoration.
- [x] 38.2 Replace the custom Menu/Checkbox Status control with the stock controlled Mantine MultiSelect, adapting its empty display value to the existing all-status filter state without changing the pure view model or persisted preferences.
- [x] 38.3 Run focused dashboard and view-model tests, quality-contract coverage, typecheck, strict OpenSpec validation, and `git diff --check`; stop without committing.

## 39. Stack latest deployment detail below its status

- [x] 39.1 Add focused component and stylesheet-contract tests proving the trigger's label and optional status share its first row, detail spans the second row, and existing modal/focus behavior remains intact.
- [x] 39.2 Apply the minimum existing-trigger markup order and navigation-scoped grid rules without changing state, dependencies, header centering, or responsive behavior.
- [x] 39.3 Run focused navigation/configuration and quality-contract tests, typecheck, strict OpenSpec validation, and `git diff --check`; stop without committing.

## 40. Let the narrow header wrap naturally

- [x] 40.1 Add focused responsive-header contracts proving flex wrapping, symmetric brand/avatar rails, auto-width centered deployment, and removal of the forced brand row.
- [x] 40.2 Replace only the premature narrow header grid/brand rule with the wrapping flex layout while retaining the deployment summary, modal, avatar menu, and desktop header behavior.
- [x] 40.3 Run focused navigation/configuration and quality-contract tests, typecheck, strict OpenSpec validation, and `git diff --check`; stop without committing.
