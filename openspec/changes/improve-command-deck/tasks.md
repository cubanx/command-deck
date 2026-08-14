## 1. Compact dashboard evidence and accessible section

- [x] 1.1 Add focused rendering and accessibility tests for collapsed native OpenSpec disclosure, its compact summary/current-group checklist, the existing Open tasks link, and the non-visual pull-request section name.
- [x] 1.2 Replace expanded OpenSpec task markup with default-collapsed `<details>`/`<summary>` and remove the visible pull-request heading without adding client disclosure state.
- [ ] 1.3 Run the focused dashboard tests, typecheck, and diff check.

Checkpoint: stop for user review after Group 1.

## 2. Authoritative deployment status projection

- [ ] 2.1 Add a focused failing regression fixture that proves the stale `in_progress` sequence across bootstrap, status ordering, webhook ingestion, and dashboard projection; stop without production changes if repository evidence cannot prove the reported incorrect state.
- [ ] 2.2 Retain provider deployment-status identity and creation time and implement one shared deterministic newest-status rule for bootstrap and webhook projection without relabeling dashboard state.
- [ ] 2.3 Add focused tests for unordered/equal-time statuses, stale terminal replacement, conditional `304` preservation, and newest-first dashboard projection.
- [ ] 2.4 Run focused deployment/GitHub tests, typecheck, and diff check.

Checkpoint: stop for user review after Group 2.

## 3. Unified configuration, appearance, and Reconcile now

- [ ] 3.1 Add behavioral/accessibility tests that both top actions open one configuration section containing checkout, existing notification, System/Dark/Light, and authenticated Reconcile now controls.
- [ ] 3.2 Add tests for browser-local appearance persistence, live System scheme changes, explicit overrides, semantic colors, focus, and contrast hooks.
- [ ] 3.3 Add server tests for authenticated user-scoped reconciliation, foreign/no installation rejection, one shared scheduled/manual in-flight guard, success refresh, running state, and sanitized failure.
- [ ] 3.4 Implement the hash-addressed configuration section, relocate the existing notification control unchanged, and implement native browser-local appearance preferences.
- [ ] 3.5 Add the minimal user-bound approved-installation selector and `POST /api/reconcile` route that reuse installation bootstrap behind the shared in-flight reconciliation guard.
- [ ] 3.6 Run focused server/dashboard tests, typecheck, and diff check.

Checkpoint: stop for user review after Group 3.

## 4. Browser-local multi-checkout mapping

- [ ] 4.1 Add focused browser-script tests for IndexedDB directory-handle persistence, reload permission revalidation, account-root resolution, explicit resolved/unresolved states, exact override validation, and unsupported-browser fallback.
- [ ] 4.2 Add collision tests proving same-named branches in different repositories cannot share local OpenSpec evidence and ambiguous/unverified folders remain unassociated.
- [ ] 4.3 Implement the smallest IndexedDB handle store keyed by installation account and stable repository ID, with exact-name automatic resolution and verified repository overrides.
- [ ] 4.4 Extend local checkout parsing only enough to read repository identity, HEAD, and OpenSpec tasks; keep every handle/path/file/branch/OpenSpec value client-only.
- [ ] 4.5 Associate each resolved checkout with only its repository's pull requests and expose accessible permission/resolution/error states.
- [ ] 4.6 Run focused local-evidence/dashboard tests, typecheck, and diff check.

Checkpoint: stop for user review after Group 4.

## 5. Guarded per-PR Merge control

- [ ] 5.1 Add focused disabled-permission and accessibility tests showing an unavailable Merge control and reason under current read-only installation permissions.
- [ ] 5.2 Add authorization tests for session-bound single-use merge OAuth intent, identity mismatch, missing/foreign installation or repository, insufficient current user role, and non-persistence of the request-local user token.
- [ ] 5.3 Add eligibility tests for closed/draft PRs, mergeability, protections/rulesets, required checks/reviews, allowed merge method, and existing OpenSpec completion policy.
- [ ] 5.4 Add exact-head race, action-time confirmation, protected-state refusal, permission absence, sanitized conflict, immediate refresh, and success tests.
- [ ] 5.5 Implement action-time user reauthorization and role proof before minting installation authority; fail closed if role proof requires an unapproved OAuth scope change.
- [ ] 5.6 Implement authoritative eligibility re-fetch and confirmation bound to repository, PR number/title, exact head SHA, and `MERGE`, rechecking all mutable gates before mutation.
- [ ] 5.7 Implement GraphQL `mergePullRequest` with `expectedHeadOid` and `mergeMethod: MERGE`, sanitized outcome categories, and immediate projection refresh.
- [ ] 5.8 Render the per-card Merge control while leaving it unavailable until the separate operational permission rollout succeeds.
- [ ] 5.9 Run focused authorization/merge tests, typecheck, and diff check.

Checkpoint: stop for user review after Group 5.

## 6. Integrated validation and handoff

- [ ] 6.1 Run the full test suite, typecheck, focused accessibility checks, and `git diff --check` with no new dependencies.
- [ ] 6.2 Strictly validate `improve-command-deck` and confirm all PR-owned tasks are complete without provider, permission, installation, deployment, production, or merge evidence.
- [ ] 6.3 Reconcile documentation for browser support, local-only data, configuration, disabled Merge permission, and the separate operational follow-up.
- [ ] 6.4 Record the exact PR #8 handoff dependency in `operate-command-deck-merge-permission` without executing it.

Checkpoint: stop for final user review before any commit, push, pull request, deployment, provider change, or production action.
