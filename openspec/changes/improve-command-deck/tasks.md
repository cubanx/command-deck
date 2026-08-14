## 1. Compact dashboard evidence and accessible section

- [x] 1.1 Add focused rendering and accessibility tests for collapsed native OpenSpec disclosure, its compact summary/current-group checklist, the existing Open tasks link, and the non-visual pull-request section name.
- [x] 1.2 Replace expanded OpenSpec task markup with default-collapsed `<details>`/`<summary>` and remove the visible pull-request heading without adding client disclosure state.
- [x] 1.3 Run the focused dashboard tests, typecheck, and diff check.
- [x] 1.4 Add focused installability tests for favicon, Apple touch, PNG manifest, maskable, cached asset, and CC provenance declarations.
- [x] 1.5 Adapt the OpenMoji control-knobs artwork into the Command Deck palette, generate the minimal cross-browser icon set, and record CC BY-SA attribution and modifications.
- [x] 1.6 Run focused PWA tests, typecheck, strict OpenSpec validation, and diff check.
- [x] 1.7 Add focused tests for the stable Night Deck install icon and adaptive Signal-light/Night-dark favicon and in-app mark.
- [x] 1.8 Add one native adaptive SVG for the favicon and decorative in-app mark while retaining Night Deck for installed and Safari fallback icons.
- [x] 1.9 Run focused PWA/dashboard tests, typecheck, strict OpenSpec validation, and diff check.

Checkpoint: stop for user review after Group 1.

## 2. Authoritative deployment status projection

- [x] 2.1 Add a focused failing regression fixture that proves the stale `in_progress` sequence across bootstrap, status ordering, webhook ingestion, and dashboard projection; stop without production changes if repository evidence cannot prove the reported incorrect state.
- [x] 2.2 Retain provider deployment-status identity and creation time and implement one shared deterministic newest-status rule for bootstrap and webhook projection without relabeling dashboard state.
- [x] 2.3 Add focused tests for unordered/equal-time statuses, stale terminal replacement, conditional `304` preservation, and newest-first dashboard projection.
- [x] 2.4 Run focused deployment/GitHub tests, typecheck, and diff check.

Checkpoint: stop for user review after Group 2.

Dependency satisfied: the PR-owned `establish-code-quality-safety` change is complete and locally validated. Group 3 is unblocked; both changes still publish together in intended PR #8.

## 3. Sticky pull-request controls and Actions failure detail

- [x] 3.1 Add focused behavioral/accessibility tests for the sticky controls, final result count, one Clear action, `/` focus, Escape clearing, focus order, keyboard use, and narrow wrapping.
- [x] 3.2 Add tests for exact Mergeable/Ready for review/Draft precedence including a mergeable draft, default bucket order, and PR number descending within every bucket.
- [x] 3.3 Add tests for dependency-free search ranking, exact numeric PR matching, every approved search field, searchable multi-repository selection, and combined search/status/repository filtering.
- [x] 3.4 Add event/rendering tests that keep Actions and Checks distinct, retain authoritative failed-workflow names and safe run links, clear later-successful failures, and never invent job or step detail.
- [x] 3.5 Implement one derived client-side pull-request view with native sticky controls and the smallest deterministic matcher, plus signed `workflow_run` failure projection and linked rendering; defer jobs and steps.
- [x] 3.6 Run focused dashboard/access/event tests, typecheck, strict OpenSpec validation, and diff check.

Checkpoint: stop for user review after Group 3.

## 4. Unified configuration, appearance, and Reconcile now

- [x] 4.1 Add behavioral/accessibility tests that both top actions open one configuration section containing checkout, existing notification, System/Dark/Light, and authenticated Reconcile now controls.
- [x] 4.2 Add tests for browser-local appearance persistence, live System scheme changes, explicit overrides, semantic colors, focus, and contrast hooks.
- [x] 4.3 Add server tests for authenticated user-scoped reconciliation, foreign/no installation rejection, one shared scheduled/manual in-flight guard, success refresh, running state, and sanitized failure.
- [x] 4.4 Implement the hash-addressed configuration section, relocate the existing notification control unchanged, and implement native browser-local appearance preferences.
- [x] 4.5 Add the minimal user-bound approved-installation selector and `POST /api/reconcile` route that reuse installation bootstrap behind the shared in-flight reconciliation guard.
- [x] 4.6 Run focused server/dashboard tests, typecheck, and diff check.

Checkpoint: stop for user review after Group 4.

## 5. Deterministic pull-request ordering

- [x] 5.1 Add focused failing tests for the six independent unresolved-gate categories, one-count-per-category behavior, visible blocker labels, Closest-to-merge ordering, OpenSpec-progress tie-breaks, and pull-request-number ties.
- [x] 5.2 Add focused tests for every approved sort mode and direction, null-last deterministic fallbacks, browser-local restoration and invalid-value fallback, Clear preserving sort, and the accessible unavailable Codex-activity option without activity-file or network behavior.
- [x] 5.3 Implement the smallest native sort selector and direction control in the existing derived client view, persist one allowlisted scalar preference, show exact blocker evidence, and keep status, Actions, Checks, search, and repository controls as filters.
- [x] 5.4 Run focused pull-request/dashboard tests, canonical `bun run validate:all`, strict OpenSpec validation, and `git diff --check`.

Checkpoint: stop for user review after Group 5.

## 6. Browser-local multi-checkout mapping

- [ ] 6.1 Add focused browser-script tests for IndexedDB directory-handle persistence, reload permission revalidation, account-root resolution, explicit resolved/unresolved states, exact override validation, and unsupported-browser fallback.
- [ ] 6.2 Add collision tests proving same-named branches in different repositories cannot share local OpenSpec evidence and ambiguous/unverified folders remain unassociated.
- [ ] 6.3 Implement the smallest IndexedDB handle store keyed by installation account and stable repository ID, with exact-name automatic resolution and verified repository overrides.
- [ ] 6.4 Extend local checkout parsing only enough to read repository identity, HEAD, and OpenSpec tasks; keep every handle/path/file/branch/OpenSpec value client-only.
- [ ] 6.5 Associate each resolved checkout with only its repository's pull requests and expose accessible permission/resolution/error states.
- [ ] 6.6 Run focused local-evidence/dashboard tests, typecheck, and diff check.

Checkpoint: stop for user review after Group 6.

## 7. Guarded per-PR Merge control

- [ ] 7.1 Add focused disabled-permission and accessibility tests showing an unavailable Merge control and reason under current read-only installation permissions.
- [ ] 7.2 Add authorization tests for session-bound single-use merge OAuth intent, identity mismatch, missing/foreign installation or repository, insufficient current user role, and non-persistence of the request-local user token.
- [ ] 7.3 Add eligibility tests for closed/draft PRs, mergeability, protections/rulesets, required checks/reviews, allowed merge method, and existing OpenSpec completion policy.
- [ ] 7.4 Add exact-head race, action-time confirmation, protected-state refusal, permission absence, sanitized conflict, immediate refresh, and success tests.
- [ ] 7.5 Implement action-time user reauthorization and role proof before minting installation authority; fail closed if role proof requires an unapproved OAuth scope change.
- [ ] 7.6 Implement authoritative eligibility re-fetch and confirmation bound to repository, PR number/title, exact head SHA, and `MERGE`, rechecking all mutable gates before mutation.
- [ ] 7.7 Implement GraphQL `mergePullRequest` with `expectedHeadOid` and `mergeMethod: MERGE`, sanitized outcome categories, and immediate projection refresh.
- [ ] 7.8 Render the per-card Merge control while leaving it unavailable until the separate operational permission rollout succeeds.
- [ ] 7.9 Run focused authorization/merge tests, typecheck, and diff check.

Checkpoint: stop for user review after Group 7.

## 8. Integrated validation and handoff

- [ ] 8.1 Run canonical `bun run validate:all`, focused accessibility checks, and `git diff --check` with no new product dependencies.
- [ ] 8.2 Strictly validate `improve-command-deck` and confirm all PR-owned tasks are complete without provider, permission, installation, deployment, production, or merge evidence.
- [ ] 8.3 Reconcile documentation for browser support, local-only data, configuration, disabled Merge permission, and the separate operational follow-up.
- [ ] 8.4 Record the exact PR #8 handoff dependency in `operate-command-deck-merge-permission` without executing it.

Checkpoint: stop for final user review before any commit, push, pull request, deployment, provider change, or production action.
