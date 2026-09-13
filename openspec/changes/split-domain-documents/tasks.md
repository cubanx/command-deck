## 1. Establish implementation scope

- [ ] 1.1 Resolve the retention-change overlap and establish an aligned implementation branch from current main without unrelated outgoing commits; verify branch/base SHAs and document any prerequisite merge.
- [ ] 1.2 Trace current aggregate/cache/notification callers using repository guidance and map each to its new owner, identifying only actual multi-document dependencies; verify the map covers authentication, ingestion, reconciliation, snapshot, merge actions and demo fixtures.
- [ ] 1.3 Capture a reproducible local baseline of snapshot stages, payload size and webhook queue/processing time with representative multi-repository fixtures; retain commands and measured results for comparison.

## 2. Introduce domain storage

- [ ] 2.1 Write failing storage tests for shared identity, separate PR writes, bounded documents and no-op updates; implement users, installations, bindings, repositories, PRs and deployments with native indexes and verify those tests pass.
- [ ] 2.2 Write failing conflict/replay tests; implement per-document atomic updates and evidence ordering, verifying concurrent webhook/reconcile changes survive and separate PRs do not rewrite common roots.
- [ ] 2.3 Preserve session, OAuth state and merge-intent security boundaries while replacing aggregate lookups; verify expiry, single-use state, hashed storage and exact-head intent tests pass.
- [ ] 2.4 Implement receipt timing and 259200-second done/ignored retention consistently with the existing retention change; verify native TTL selection, unfinished/rejected preservation and payload cleanup tests.
- [ ] 2.5 Implement independent bounded reconciliation-run records and 72-hour completed-run expiry; verify sanitized output, active-run preservation and access-scoped reads.

## 3. Connect users and authorize shared data

- [ ] 3.1 Write failing verified-connection tests, then persist shared installations and separate bindings through existing OAuth/setup paths; verify allowlist, multiple installations and duplicate binding behavior.
- [ ] 3.2 Replace authentication/snapshot/detail authorization with narrow identity reads and shared-domain selection; verify two-user isolation, shared installation access, repository removal, suspension and binding revocation.
- [ ] 3.3 Preserve guarded merge permissions with the new storage model; verify existing user/session/exact-head checks and denied action coverage.

## 4. Project webhooks into their owners

- [ ] 4.1 Write failing supported-event tests, then move PR/review/check/workflow/repository/installation/deployment effects into their owning documents; verify existing event distinctions, stale-event rejection and unknown-action behavior.
- [ ] 4.2 Implement receipt completion after required repeatable effects; verify interruption after a write, startup recovery, retry scheduling and replay after receipt expiry without manual reconciliation.
- [ ] 4.3 Publish authorized SSE refresh promptly after affected durable state changes; verify dispatchable frames, revocation, and a PR title update becoming visible without browser reload while unrelated backlog exists.

## 5. Reconcile and reconstruct from empty state

- [ ] 5.1 Write failing shared-reconciliation tests, then synchronize each installation once with per-resource complete-list removal; verify all pages, partial failures, rate-limit/timeout recovery and newer webhook preservation.
- [ ] 5.2 Replace generic provider-cache consumers with owner-scoped validators or unconditional pagination; verify 304 preservation, mixed 200/304 pages where retained, missing cached data, changing page boundaries and authorization/request scoping.
- [ ] 5.3 Embed committed OpenSpec evidence in its proven PR, retaining merged evidence and exact-default-commit post-merge progress; verify ambiguous association, reused change names, source removal and no unassociated hosted/local cards.
- [ ] 5.4 Implement cold discovery of open PRs, recent deployments and merged PRs with unfinished obligations; verify an empty-store fixture with multiple pages and older merged work outside the deployment window, plus visible incomplete-discovery failure.

## 6. Update dashboard preferences and remove notifications

- [ ] 6.1 Write failing API tests, then add validated field-level preferences.ui.dashboard updates for repository IDs, sort and supported filters; verify defaults, invalid input, cross-user denial and concurrent ingestion/preferences changes.
- [ ] 6.2 Restore and save preferences in the frontend without overwriting loaded state with defaults; verify reload, second-device restore, Clear behavior, revoked repositories and sanitized load/save failures.
- [ ] 6.3 Remove notification producers, storage integration, snapshot payloads, permission controls and popup delivery; verify their absence and continued live card refresh.
- [ ] 6.4 Update the local demo and fixtures to the new model without provider calls; verify representative PR, deployment, OpenSpec and preference behavior through the canonical UI.

## 7. Validate and prepare the clean-start procedure

- [ ] 7.1 Delete obsolete aggregate helpers, generic cache paths and binding-seed maintenance code; verify no legacy reads, dual writes or historical imports remain and existing initialization/environment guards still pass.
- [ ] 7.2 Run the full repository validation manifest with isolated MongoDB, strict OpenSpec validation and credential scan; retain successful commands/results and resolve failures.
- [ ] 7.3 Repeat the local baseline and verify query plans, scoped reads, response size, absence of unrelated document rewrites, and webhook-to-card timing; document measured gains and remaining bottlenecks without claiming unmeasured production improvement.
- [ ] 7.4 Deliver an exact-target clean-start runbook covering writer/intake quiescence, reset, exact-revision deployment, initialization, reconnect/reconcile, intake-gap recovery and failure handling; verify it requires applicable production authorization and contains no migration or mixed-schema operation.
- [ ] 7.5 Exercise the complete clean-start sequence in an isolated environment and record evidence for rebuilt older obligations, preferences and automatic live updates; verify all pre-merge requirements are complete before readiness.

## 8. Execute clean start [post-merge]

Prerequisites: this change is merged; the runbook is reviewed; exact deployment artifact provenance is known; applicable task-scoped production authorization is granted. These tasks cannot be satisfied by local tests or the merge alone.

- [ ] 8.1 Execute the authorized runbook against its exact named target, with old writers stopped before reset; verify deployed merge/artifact SHA, new-schema initialization and readiness before reconnecting users.
- [ ] 8.2 Sign in, reconnect and reconcile, then reconcile across the intake gap; verify expected open cards, older merged obligations, deployment state and authorized installation scope against current GitHub evidence.
- [ ] 8.3 Verify saved preferences survive reload and another session, and a new PR title edit reaches the card without browser refresh; capture receipt/start/completion and UI timing plus scoped request measurements.
- [ ] 8.4 Verify native retention indexes and eligible receipt/run cleanup while incomplete records remain, and record remaining latency limitations; mark rollout complete only with the required evidence.
