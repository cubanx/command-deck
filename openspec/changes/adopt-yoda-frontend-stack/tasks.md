## 1. Establish the Yoda-aligned frontend baseline

- [x] 1.1 Add a focused failing component-shell test that asserts the root providers render an accessible Command Center main surface, and verify `bun run test -- test/frontend-shell.test.tsx` fails before the runtime exists.
- [x] 1.2 Add the verified Yoda-compatible React, TanStack Router/Query, Mantine, Vite, Vitest, and Testing Library dependencies plus the minimal root providers and test harness, and verify `bun run test -- test/frontend-shell.test.tsx` passes without changing the served legacy UI.
- [x] 1.3 Add a production client-build smoke check for the new entrypoint and verify it emits loadable browser assets without using HTML-string injection or a parallel template layer.
- [x] 1.4 Run `bun run typecheck`, `bun run test -- test/frontend-shell.test.tsx test/web-runtime.test.ts test/pr-view.test.ts test/web-build.test.ts`, `openspec validate adopt-yoda-frontend-stack --strict`, and `git diff --check`.

## 2. Add the routed snapshot and event boundary

- [ ] 2.1 Add failing tests for route-prefetched snapshot loading, one Query cache, event-driven invalidation, reconnect refresh, preserved local preferences, and no healthy-stream polling; verify the focused tests fail before implementation.
- [ ] 2.2 Implement the file-based dashboard/configuration routes, feature-local snapshot query and mutation options, and one root EventSource bridge over the existing `/api/snapshot` and `/events` contracts; verify the focused route/query tests pass.
- [ ] 2.3 Verify existing authenticated snapshot, SSE, reconciliation, merge, OAuth, and webhook server tests still pass unchanged.
- [ ] 2.4 Run `bun run typecheck`, the focused frontend/server tests declared by this group, `openspec validate adopt-yoda-frontend-stack --strict`, and `git diff --check`.

## 3. Port the dashboard view model and authority gates

- [ ] 3.1 Port focused failing tests for lifecycle precedence, attention, filters, fuzzy search, repository selection, exclusive status buckets, ordering preferences, multi-OpenSpec presentation, and lifecycle-ready merge controls from string assertions to view-model assertions.
- [ ] 3.2 Implement the minimum pure dashboard view model by reusing the current algorithms once, and verify the ported behavior tests pass.
- [ ] 3.3 Add failing tests proving browser-local detected OpenSpecs remain separate from authoritative `open_specs` and cannot change lifecycle, attention, or merge availability; then implement the separation and verify the tests pass.
- [ ] 3.4 Verify the existing access, OpenSpec projection, and action-time merge suites still pass, then run `bun run typecheck`, `openspec validate adopt-yoda-frontend-stack --strict`, and `git diff --check`.

## 4. Migrate the operational dashboard components

- [ ] 4.1 Add Testing Library failures for accessible dashboard cards, lifecycle rails, status/deployment detail focus and dismissal, filters, search, repository selection, ordering, empty/error states, and narrow-viewport semantics.
- [ ] 4.2 Implement the Mantine-backed dashboard, lifecycle, OpenSpec, status, deployment, filter, search, and ordering components and verify the focused accessibility and parity tests pass.
- [ ] 4.3 Add failing tests for reconciliation and exact-head merge controls, sanitized status announcements, lifecycle fail-closed visibility, confirmation, focus return, and post-mutation refresh; implement the components against existing endpoints and verify the tests pass.
- [ ] 4.4 Run `bun run typecheck`, all focused component tests plus existing reconciliation/merge tests, `openspec validate adopt-yoda-frontend-stack --strict`, and `git diff --check`.

## 5. Migrate configuration, local checkout, appearance, and PWA behavior

- [ ] 5.1 Add failing component tests for avatar navigation, the configuration route, IndexedDB/File System Access checkout setup, local-evidence labeling, appearance persistence, and responsive navigation.
- [ ] 5.2 Implement the Mantine-backed configuration and navigation components while preserving the existing browser checkout adapter and preferences; verify the focused tests pass and local evidence remains non-authoritative.
- [ ] 5.3 Update the client asset manifest integration and verify the HTML shell, icons, manifest, service worker, content types, cache headers, and installed-app loading through existing PWA/server tests.
- [ ] 5.4 Run `bun run typecheck`, all focused configuration/PWA tests, `openspec validate adopt-yoda-frontend-stack --strict`, and `git diff --check`.

## 6. Cut over and remove the legacy renderer

- [ ] 6.1 Switch the served shell to the production Vite client assets and verify browser-build and server integration tests load the React application through the existing `createApp(...).fetch` runtime.
- [ ] 6.2 Delete the superseded HTML-string renderer, render-bound event wiring, obsolete build path, redundant CSS, and string-markup tests only after equivalent component coverage passes; verify no application-owned `innerHTML`, Lit, Mustache, or parallel renderer remains.
- [ ] 6.3 Run `bun run typecheck`, the full `bun run test` suite with every component/UI test included and zero failures, `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun run validate:all`, `openspec validate adopt-yoda-frontend-stack --strict`, and `git diff --check`.
- [ ] 6.4 Record the exact validation results and remaining deployment/observation gates; stop without commit, push, PR, deploy, production access, or external mutation.
