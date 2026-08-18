## 1. Lifecycle contract and regression coverage

- [ ] 1.1 Add focused dashboard/view-model tests for Draft, Ready for review, and Mergeable precedence, including a projected regression from Mergeable to an earlier stage.
- [ ] 1.2 Add focused tests for one-warning rendering, preserved exact blocker/detail evidence, and absence of default positive-status pills.
- [ ] 1.3 Add focused interaction tests for the shared status-detail popover across hover, keyboard focus, click/tap pinning, dismissal, and failed-workflow links.
- [ ] 1.4 Add focused filter tests for lifecycle-stage selection and independent attention/blocker filtering.

## 2. Dashboard status presentation

- [ ] 2.1 Reuse the existing projected snapshot fields to derive and render the compact three-stage PR lifecycle rail.
- [ ] 2.2 Replace always-visible PR status pills with the lifecycle rail, one actionable warning when needed, and neutral linked OpenSpec context.
- [ ] 2.3 Implement the shared accessible status-detail popover without adding a GitHub request or a new dependency.
- [ ] 2.4 Consolidate the PR filter bar into Draft, Ready for review, Mergeable, and separate attention/blocker controls.

## 3. Verification

- [ ] 3.1 Run the focused dashboard tests and `bun run typecheck`.
- [ ] 3.2 Run `openspec validate refine-pr-status-pipeline --strict` and `git diff --check`.
