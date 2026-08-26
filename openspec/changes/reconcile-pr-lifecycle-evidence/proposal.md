## Why

The command center can remain stale after pull request, review-thread, check, or merge changes, and its current lifecycle buckets do not reflect OpenSpec readiness, review closure, repository-required checks, or exact provider mergeability. Operators need a webhook-first dashboard that converges cheaply, explains each PR's next gate, and exposes deliberate repair controls without repeatedly scanning an entire GitHub installation.

## What Changes

- Replace the current draft/ready/mergeable bucketing with the agreed lifecycle precedence: Draft, OpenSpec ready, Ready for review, Reviewing, and Mergeable.
- Trust exact `[post-merge]` OpenSpec task-group headings as non-blocking for pre-merge readiness while preserving them in total progress; repository guidance prevents mixed groups. Allow an explicit `openspec-not-required` label when no OpenSpec applies.
- Reconcile one PR authoritatively after lifecycle-relevant webhooks, coalesce bursts, and reconcile all known PRs every ten minutes from 07:00 through 18:50 on weekdays in `America/New_York`.
- Persist every correctly signed, well-formed GitHub delivery before identity resolution; retain unresolved identity as retryable `pending_verification` work with sanitized diagnostics until a later binding, provider repair, or startup pass can project it exactly once.
- After the startup inbox drain, run exactly one non-blocking broad installation reconciliation through the existing single-flight path so missed opens are discovered and stale closed or merged PRs are removed without waiting for manual repair.
- After each successful persisted user-visible change, invalidate every affected connected dashboard so it refetches its snapshot without polling.
- Add manual PR, all-PR, and installation reconciliation controls; make installation reconciliation the explicit broad repair and repository-policy refresh path, with no scheduled broad scan.
- Cache watched-repository rules and evaluate only required checks against the exact current head while continuing to display non-required checks as information.
- After merge and separate provider authorization, verify GitHub App Pull requests, commit-status, and `Checks: read` permissions and add any missing review, check-run/check-suite, and status subscriptions; missing Checks access remains fail-closed before then.
- Persist bounded, aggregate reconciliation-run telemetry in MongoDB for read-only operational analysis without adding dashboard telemetry UI.
- Sort PRs globally by GitHub opened time, oldest first, independent of repository.
- Show the newest completed successful or failed deployment from the last 48 hours using a correlated PR number/title when available and a linked short SHA otherwise, without repository or redundant SHA text.
- Project every OpenSpec declared by the authoritative exhaustive `## OpenSpecs` PR-body section, retaining a deterministic first singular item only for legacy consumers; show changed-path candidates as detected informational evidence and require every confirmed declared OpenSpec to be pre-merge ready for lifecycle readiness and guarded merge eligibility.
- Default dashboard ordering to Closest to merge and retain the all-PR reconciliation action only in the avatar/configuration controls.
- Make `bun run dev` the Varlock-backed real-data local command while retaining an explicit credential-free demo command.
- Resolve a declared OpenSpec from its active exact-head task file first, then only from one matching changed archive task path after an active 404; retain failed one-PR reconciliation visibly retryable.
- Treat only current added, modified, or renamed PR changed-file entries as OpenSpec detection or archive-location evidence; removed paths are historical only.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `command-center-dashboard`: Define lifecycle precedence, blockers, global opened-time ordering, reconciliation controls, and completed-deployment headline behavior.
- `openspec-progress`: Define pre-merge readiness, exact `[post-merge]` task-group semantics, and the explicit no-OpenSpec exemption.
- `event-projections`: Extend webhook-triggered PR freshness and retain authoritative deployment-to-PR correlation evidence.
- `provider-reconciliation`: Add targeted lifecycle reads, cached repository policy, schedules and controls, concurrency rules, and bounded reconciliation telemetry.

## Impact

- Changes the dashboard snapshot and MongoDB projection shapes for plural PR OpenSpec evidence with a legacy singular compatibility item, PR lifecycle evidence, opened timestamps, deployment correlation, cached repository policy, and reconciliation-run summaries.
- Extends durable webhook intake, retry, and GitHub App handling for review comments, resolved review threads, commit statuses, and other lifecycle-relevant events without silently dropping verified deliveries.
- Adds GitHub GraphQL reads for review-thread resolution and PR/check aggregation while reusing REST for Actions, OpenSpec files, and installation repair.
- Keeps repository snapshot presence and directory listings from implying a PR/OpenSpec relationship; only an exhaustive valid PR-body declaration confirms one, while changed paths remain detected informational candidates.
- Removes the automatic broad installation-reconciliation timer; installation bootstrap, one startup repair, and explicit manual repair remain.
- Adds no dependency and performs no GitHub mutation as part of reconciliation.
