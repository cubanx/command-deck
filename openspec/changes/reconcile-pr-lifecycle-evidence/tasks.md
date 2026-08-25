## 1. Projection contracts and OpenSpec readiness

- [x] 1.1 Add failing parser tests for exact `[post-merge]` groups regardless of task wording, unmarked post-merge-like prose, total progress, pre-merge readiness, and `openspec-not-required` applicability, and verify the focused tests fail for the missing behavior.
- [x] 1.2 Extend the existing OpenSpec parser and projection with pre-merge readiness while preserving total progress, and verify the focused parser/projection tests pass.
- [x] 1.3 Add failing persistence tests for optional PR opened time, repository policy, bounded merged-PR correlation evidence, and aggregate reconciliation-run records with TTL/index/privacy constraints, and verify the tests fail for the missing schema behavior.
- [x] 1.4 Extend the existing MongoDB models and indexes without a new dependency, preserve compatibility with existing rows, and verify the focused persistence tests pass.

## 2. Canonical lifecycle and ordering

- [x] 2.1 Add table-driven failing tests for every lifecycle precedence and regression case, including draft priority, missing/exempt/incomplete OpenSpec, bot `COMMENTED` reviews, unresolved threads, current changes-requested state, required checks, absent policy, unknown/conflicting mergeability, and non-substantive head changes.
- [x] 2.2 Implement one shared lifecycle reducer and blocker projection used by buckets, filters, details, and mergeability display, and verify the lifecycle tests pass without changing guarded merge-action authorization.
- [x] 2.3 Add failing UI tests for five accessible lifecycle stages and filters, informational non-required checks, and exact blocker copy, then update the dashboard rendering and verify those tests pass in light and dark fixtures.
- [x] 2.4 Add failing ordering tests for global GitHub opened-time ascending order, unknown values last, stable identity ties, removal of PR-number sort, and browser-local preference fallback, then implement the ordering and verify the focused UI tests pass.
- [x] 2.5 Add failing access, lifecycle, local projection, UI, provider, and guarded-merge server regression tests for every exact-head correlated OpenSpec, all unique-branch fallback matches only when no exact-head match exists, deterministic dedupe and ordering, legacy singular-first compatibility, every-spec readiness, and rendering every correlated OpenSpec.
- [x] 2.6 Implement plural OpenSpec correlation and projection, lifecycle and guarded-merge readiness over every correlated OpenSpec with legacy singular fallback, and multi-OpenSpec rendering; verify the focused tests pass.

## 3. Targeted provider evidence and policy

- [x] 3.1 Add failing provider tests for the bounded GraphQL PR/review/thread/check query, complete thread pagination, exact-head REST Actions, correlated OpenSpec reads, closed-target removal, and fail-closed partial results.
- [x] 3.2 Implement the canonical one-PR repair path with installation tokens, exact-head correlation, bounded pagination/backoff, and sanitized failure preservation, and verify the focused provider tests pass.
- [x] 3.3 Add failing policy tests for ruleset and classic-protection projection, context plus integration matching, acceptable required conclusions, absent/stale policy, partial refresh preservation, and informational non-required checks.
- [x] 3.4 Extend installation bootstrap and explicit installation reconciliation to refresh repository policy while keeping targeted PR repair policy-read-free, and verify the focused policy tests pass.

## 4. Reconciliation coordination, schedule, and telemetry

- [x] 4.1 Add failing concurrency and startup tests for per-installation serialization, deduplicated PR targets, debounce, one dirty follow-up, stale-response rejection, overlap among webhook, scheduled, startup, and manual triggers, missed-close removal, missed-open discovery, exactly one post-drain startup repair, and failure preservation without startup or readiness failure.
- [x] 4.2 Reuse the existing reconciliation guard to implement the installation-local pending-PR coordinator and exactly one non-blocking post-drain startup installation reconciliation, and verify the concurrency/startup tests pass without parallel provider reads, dropped targets, or readiness coupling.
- [x] 4.3 Add failing scheduler tests for DST-aware `America/New_York` weekdays, immediate 07:00 execution, ten-minute boundaries through 18:50, off-hours/weekend suppression, and removal of the broad six-hour timer.
- [x] 4.4 Implement the dependency-free weekday scheduler and verify scheduler tests plus startup/shutdown cleanup pass.
- [x] 4.5 Add failing telemetry tests for scheduled/webhook/startup/manual trigger categories, provider-request counting, no-op retention, aggregate changed-field categories, sanitized failures, unresolved-delivery and reconciliation-repair counts, 14-day expiry, and exclusion from application snapshots.
- [x] 4.6 Persist one aggregate run record for every reconciliation through the shared provider boundary and verify telemetry tests pass without storing PR identity, URLs, webhook payloads, or raw diagnostics while detailed sanitized delivery outcomes remain durable.

## 5. Webhook freshness and deployment correlation

- [x] 5.1 Add failing intake and recovery tests proving invalid signatures and invalid envelopes remain rejected, duplicate delivery IDs are idempotent success, and correctly signed account-less, ambiguous, conflicting, or temporarily failed identity resolution remains durably recoverable with its payload until eventual exactly-once projection.
- [x] 5.2 Persist every verified delivery before identity resolution; add bounded-backoff `pending_verification`, sanitized reason/timestamps, startup/binding/repair retry, payload clearing only after recorded success or no-op, unresolved telemetry/alert evidence, and durable attribution when authoritative reconciliation repairs the event effect; verify the focused intake/recovery tests pass.
- [x] 5.3 Add failing event tests for open `pull_request` actions, review/review-comment/resolved-thread events, checks, workflows, commit statuses, exact local head-SHA fallback, unknown associations, closed removal, and coalesced targeted repair.
- [x] 5.4 Route lifecycle-relevant signed events through direct projection plus the targeted coordinator, document the required GitHub App subscriptions, and verify event/inbox/SSE tests pass without installation-wide reads or silent verified-delivery loss.
- [x] 5.5 Add failing projection tests for PR-title/number/URL retention, exact head/merge-SHA deployment correlation in either event order, 48-hour retention, uncorrelated fallback, and stale deployment-status protection.
- [x] 5.6 Extend existing PR and deployment projections with bounded exact-SHA correlation evidence and verify deployment tests pass without parsing refs or fetching commits.
- [ ] 5.7 Add failing SSE acceptance tests for close deletion, missed close/open startup repair, OAuth/bootstrap, explicit repair, post-commit ordering, affected-user scope, and no polling.
- [ ] 5.8 Route successful user-visible mutations through the existing invalidation seam and verify focused behavior; defer cross-instance transport.

## 6. Reconciliation controls and deployment presentation

- [x] 6.1 Add failing authenticated-route tests for `Reconcile PR`, confirmed `Reconcile all PRs`, and broad `Reconcile installation`, including user/installation scope, call estimates, no missing-PR discovery in all-PR repair, policy refresh in installation repair, and sanitized partial failure.
- [x] 6.2 Add the three controls by reusing the canonical targeted and installation operations, place `Reconcile all PRs` in the dashboard and avatar/configuration dropdown, and verify keyboard, focus, running, success, and failure UI tests pass.
- [x] 6.3 Add failing deployment-headline tests for newest 48-hour success/failure/error selection, failed-state normalization, transient/inactive exclusion, correlated PR links, uncorrelated short-SHA links, no repository text, empty state, and unchanged history disclosure.
- [x] 6.4 Update the deployment headline and detail rendering, then verify the focused deployment/accessibility tests and local fixture states pass without a provider read.
- [x] 6.5 Run `bun run typecheck`, `bun test`, `git diff --check`, and `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun run validate:all`; record exact results and leave implementation uncommitted for review.

## 7. [post-merge] GitHub configuration and observation

- [ ] 7.1 After merge and exact deployed-SHA proof, verify the GitHub App's current Pull requests and commit-status read permissions and subscription state without changing provider configuration.
- [ ] 7.2 Under separate explicit provider authorization, subscribe the GitHub App to any missing `pull_request_review_comment`, `pull_request_review_thread`, and `status` events, and verify a configuration reread matches the intended event set.
- [ ] 7.3 Under separate explicit provider authorization, verify or create the exact `openspec-not-required` label in each watched repository that will use the exemption and record repository-scoped evidence without applying the label to a PR.
- [ ] 7.4 Observe the next natural review-thread resolution and check completion without manufacturing activity, and verify delivery ID, targeted reconciliation, SSE refresh, and sanitized telemetry evidence at the deployed SHA.
