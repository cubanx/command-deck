## Context

See `proposal.md` for motivation. The service already has durable signed-webhook intake, installation-scoped MongoDB projections, SSE refresh, conditional REST reconciliation, OpenSpec task parsing, and a shared installation reconciliation guard. The current broad reconciliation is serial and expensive, does not refetch detailed PR lifecycle evidence, and defaults to six hours. Current lifecycle buckets use only draft and provider mergeability; current deployment rows have no durable PR-title correlation; current PR rows have no opened time.

The watched repositories use GitHub rulesets rather than classic branch protection. Yoda currently requires `Validate All` and `Docker Build`; data-warehouse requires `Snowflake PR staging`. Bot reviews are normally submitted as `COMMENTED`, with actionable findings expected to become structured review threads rather than prose parsed by this service.

## Goals / Non-Goals

**Goals:**

- Make lifecycle state deterministic from committed OpenSpec and authoritative GitHub evidence.
- Keep webhooks as the fast path while bounding missed-event convergence and provider calls.
- Reuse the existing installation-token, inbox, projection, SSE, and reconciliation seams.
- Make reconciliation cost and usefulness measurable through privacy-safe MongoDB records.
- Preserve broad installation discovery as an explicit operator action.

**Non-Goals:**

- Replicate the operational `$mergeable` skill or authorize merges from the dashboard lifecycle label.
- Parse review prose, infer substantive diffs, or guess PR identity from deployment refs.
- Poll the browser, discover completely missing PRs during targeted repair, or auto-refresh repository policy.
- Add a telemetry dashboard, analytics service, dependency, or holiday calendar.
- Change GitHub repository rules, bot behavior, or GitHub App subscriptions during implementation.

## Decisions

### 1. One canonical lifecycle reducer

Create one pure lifecycle reducer over projected evidence and reuse it for bucketing, filters, blockers, sorting, and detail text. Its precedence is closed removal, Draft, OpenSpec ready, Ready for review, Reviewing, then Mergeable. Draft always wins. Any incomplete applicable OpenSpec wins over later review evidence. A new commit is not itself a regression signal, although the checks, review, OpenSpec, or mergeability evidence produced by that commit can move the PR backward.

Mergeable remains descriptive. The guarded merge action continues to perform its existing stricter action-time authorization and exact-head revalidation, including every correlated OpenSpec's readiness.

**Alternative considered:** extend the existing draft/mergeability buckets with more warning pills. Rejected because it leaves mutually contradictory status and blocker logic in several UI paths.

### 2. OpenSpec readiness is a second projection, not a second progress count

Extend the existing Markdown task parser to retain both total progress and pre-merge readiness. A heading group is post-merge only when its heading contains exact `[post-merge]`; no keyword inference or task-prose inspection is allowed. Total progress continues to count every checkbox. Readiness ignores unchecked tasks only in marked groups. Repository guidance must prevent mixed groups because the service trusts the heading. The exact human-readable PR-body section `## OpenSpecs` is authoritative and exhaustive when present: its list contains exact change slugs, and every listed slug must resolve to a committed active OpenSpec at the exact PR head. An empty declaration is the explicit no-OpenSpec path only with the exact `openspec-not-required` label. Missing, invalid, duplicate, or conflicting declarations fail closed. The confirmed collection is sorted and deduplicated deterministically; its first item remains available through the existing singular field for compatibility, but every item participates in lifecycle and guarded-merge readiness. Changed paths under `openspec/changes/<slug>/...` are detected/inferred candidates only. Without an authoritative section, detected candidates are not task evidence and create a `Confirm OpenSpec association` blocker until the PR body declares the exhaustive list or the exact `openspec-not-required` label applies. With an authoritative section, unlisted detected candidates remain informational and do not gate. Repository snapshot presence at the PR head, including an OpenSpec directory listing, is never evidence by itself. A nonempty declaration conflicts with `openspec-not-required` and fails closed; an existing incomplete confirmed OpenSpec always blocks.

**Alternative considered:** infer post-merge work from task text or maintain a separate exception registry. Rejected as ambiguous and unnecessary.

### 3. One targeted PR read path

Add one canonical targeted repair operation keyed by installation, repository, and PR number. A normal repair uses:

1. One GraphQL query for PR state, draft, creation time, labels, exact head, mergeability, reviews, review threads, and current-head status-check rollup.
2. One REST Actions query scoped to the exact head SHA to preserve the separate Actions evidence already shown by the dashboard.
3. One REST PR changed-files/path read for detected candidates under `openspec/changes/<slug>/...`, excluding entries whose status is `removed`, and one raw task-file read per declared change, resolving every listed slug at the exact PR head. On an active task-file 404 only, the same already-fetched current changed paths may locate exactly one canonical `openspec/changes/archive/YYYY-MM-DD-<slug>/tasks.md` artifact at that head; zero or multiple matches fail closed, and non-404 failures never fall back.

The normal single-OpenSpec cost includes the PR changed-files/path read; the PR body is already part of provider PR evidence. Additional declared OpenSpecs add only their raw task-file reads. A repository changes-directory listing is unnecessary for detection and never confirms a PR/OpenSpec association. Confirmed declarations are sorted and deduplicated deterministically before projection; the first remains the legacy singular item. Invalid or conflicting declarations preserve detected candidates only as informational evidence and fail lifecycle and guarded-merge readiness closed. GraphQL review-thread, review, or check connections and REST Actions paginate when required. The service reads every thread page before asserting zero unresolved threads. Required check matching uses cached context plus integration identity when supplied by a ruleset; visible non-required checks remain informational.

**Alternative considered:** reuse the current seven-call merge inspection for every repair. Rejected because it rereads repository policy per PR, still lacks resolved-thread aggregation, and is materially more expensive.

### 4. Verified delivery durability precedes identity resolution

Reject only requests that fail the GitHub trust boundary: invalid signature, oversized or malformed body, or missing required delivery/event headers. Once the signature and delivery identity are valid, insert the delivery durably before resolving installation, account, repository, or user binding. A duplicate delivery identifier is idempotent success.

When identity is missing, ambiguous, conflicting, or temporarily unavailable, retain the original payload as `pending_verification` with bounded retry metadata, sanitized reason, first/last attempt timestamps, and next-attempt time. Never convert verified unresolved work to terminal `rejected`, clear its payload, or acknowledge it as an unrecorded no-op. Retry with bounded backoff on normal drains and startup. A later binding or authoritative installation repair may resolve and project the original delivery exactly once.

Clear the raw body only after successful projection or an explicitly recorded supported no-op. Keep the delivery identity, resolution history, and sanitized outcome after payload clearing. If a complete authoritative reconciliation supersedes the delivery's data effect, mark the unresolved delivery as repaired by reconciliation and retain that diagnostic trail; aggregate telemetry may count pending and repaired deliveries but must not copy payloads or identity-sensitive event data.

**Alternative considered:** reject or ignore verified deliveries until their account is already bound. Rejected because transient or pre-deployment identity gaps become permanent silent data loss.

### 5. Webhook hints coalesce into authoritative repair

Continue direct projection of fields present in signed webhook payloads, then enqueue the affected PR in a deduplicated installation-local pending set. Use a short debounce so a review or Actions burst produces one repair. One installation-local worker processes unique PRs serially. If another hint for the active PR arrives, mark it dirty and run at most once more after the current read.

Every open `pull_request` action is eligible rather than maintaining a brittle action allowlist. Review, review-comment, resolved-thread, check-run, check-suite, workflow-run, and commit-status events target their authoritative PR association or every exact locally matched head SHA. Closed PRs are removed directly. Unknown PR associations cause no guessed mutation; the verified delivery still retains an explicit durable outcome and remains available to scheduled/manual repair when identity resolution is incomplete.

This read-only path cannot cause a GitHub webhook loop. Provider timestamps, exact heads, and existing terminal-status ordering prevent late payloads or responses from replacing newer evidence.

**Alternative considered:** patch aggregate review-thread or check truth from individual webhook payloads. Rejected because a single event cannot prove that all threads or required checks are clear.

### 6. Ten-minute business-hours repair replaces scheduled broad repair

Use the platform date/time primitives to calculate ten-minute boundaries in `America/New_York`; add no scheduler dependency. At 07:00 each weekday, enqueue all currently known open PRs, then repeat through 18:50. Do nothing at or after 19:00, before 07:00, or on weekends. Manual and webhook repair remain available continuously.

Remove the broad six-hour timer. Installation bootstrap remains automatic after binding. After the startup inbox drain, invoke exactly one non-blocking broad installation reconciliation through the existing reconciliation helper and application single-flight guard. This startup pass is a deliberate broad-repair exception: it discovers missed opens and removes stale closed or merged PRs before the next manual repair, coalesces with concurrent reconciliation, and does not gate readiness or crash startup. Complete repository snapshots replace prior state atomically; partial or failed provider work preserves prior snapshots and records the existing sanitized reconciliation diagnostics.

Outside installation bootstrap, the one startup pass, and explicit `Reconcile installation`, there is no broad discovery. The startup exception has the same broad cost as installation reconciliation, approximately 132 requests for a representative five-repository installation before lifecycle detail, but runs once per process start rather than every six hours.

At ten typical PRs, the expected cost is about 40 calls per pass, 2,880 per weekday, and 14,400 per week before pagination. Persisted run telemetry will show whether the cadence earns that cost.

**Alternative considered:** run current installation reconciliation every ten minutes. Rejected because a representative five-repository installation can make roughly 132 requests per pass before lifecycle detail and still fail to repair review/check state.

### 7. Repository policy is installation-repair state

Store a repository policy snapshot and last successful refresh time alongside repository projection metadata. Installation bootstrap and explicit `Reconcile installation` read the default branch, applicable rulesets, and classic protection. There is no scheduled or webhook policy refresh. A failed read preserves the last complete policy. An absent policy blocks Mergeable until the operator runs installation reconciliation.

`Reconcile PR` and `Reconcile all PRs` never read policy. This keeps the per-PR budget stable and makes policy configuration explicitly operator-controlled.

**Alternative considered:** subscribe to repository-policy webhooks or fetch policy per PR. Rejected because policy changes are rare and the configuration control is sufficient.

### 8. Controls reuse the same operations

Add `Reconcile PR` to each PR card. Keep `Reconcile all PRs` in the avatar/configuration dropdown; it previews current known PR count and estimated calls, then invokes the same targeted operation serially. Keep one broad `Reconcile installation` control in Configuration and fold repository-policy refresh into it. Reuse existing authenticated user-to-installation binding and sanitized result handling.

### 9. Reconciliation telemetry uses a small TTL collection

Create a `reconciliation_runs` collection rather than appending high-frequency records to the user aggregate. Each run inserts one aggregate record, including no-ops, with a 14-day TTL on completion time and an installation/time lookup index. Count requests at the shared provider fetch boundary and derive changed-field category counts by comparing projected lifecycle fields before replacement.

No PR identity, title, SHA, review content, URL, webhook payload, raw provider diagnostic, or credential enters this collection. It may include only aggregate counts of unresolved deliveries and deliveries repaired by reconciliation. It is not projected through application APIs or UI; operations can inspect it through the existing production read-only MongoDB path. Startup is a distinct trigger category. The delivery record and existing newest-20 sanitized installation evidence retain the detailed sanitized outcome trail.

**Alternative considered:** reuse the installation evidence array. Rejected because twenty ten-minute entries cover only 3 hours 20 minutes and repeatedly rewrite the user aggregate.

### 10. Opened-time ordering is provider-authoritative

Project GitHub `created_at`/`createdAt` from webhooks, bootstrap, and targeted repair. Default to Closest to merge ascending: lifecycle stage first (Mergeable through Draft), then blockers, valid OpenSpec progress, and stable identity. Opened time remains available explicitly and missing values sort last. Do not infer from repository-local PR numbers or update time. Remove PR-number sort from the global sort menu.

### 11. Deployment headline enriches existing projection locally

Before removing a merged PR, retain bounded number, title, URL, head SHA, merge SHA, and merge time for at least 48 hours. Match a deployment only by exact SHA. This supports deployments arriving before or after merge without a commit or PR lookup. Existing uncorrelated deployments remain valid and use their already-stored repository plus SHA to construct a safe linked short-SHA fallback.

Choose the newest 48-hour deployment whose status is `success`, `failure`, or `error`; present failure/error as failed. Exclude queued, pending, in-progress, inactive, and unknown states from the headline but retain them in detail history. Keep the label `Latest deployment`, since an uncorrelated deployment is not proof of the latest merged PR.

### 12. Post-commit dashboard invalidation

After any successful persisted change to user-visible Command Deck data, emit one post-commit invalidation to every affected connected user. Reuse the existing in-memory streams and refresh seam; the browser refetches `/api/snapshot`, including removals, and does not poll. Emit one invalidation per affected user for each completed mutation or batch, after persistence succeeds. Startup repair remains readiness-independent. Cross-instance transport is deferred.

## Risks / Trade-offs

- **[Stale off-hours evidence]** A lost event after Friday 19:00 can wait until Monday 07:00. → Keep manual repair continuously available and preserve webhook-first updates.
- **[Missed new PR remains undiscovered between broad repairs]** Targeted repair only knows projected PRs. → Run one startup installation repair and keep explicit installation reconciliation available in Configuration.
- **[Startup broad-repair cost]** Frequent process restarts can repeat an expensive installation scan. → Reuse the existing single-flight guard, run exactly once after inbox drain, and retain aggregate telemetry to measure its cost.
- **[Manually stale repository policy]** Policy changes can outlive the cached snapshot. → Show last successful policy refresh and a direct installation-reconcile action; fail closed when policy was never loaded.
- **[GraphQL cost or pagination grows]** Large review histories can exceed one request. → Query only lifecycle fields, paginate fail-closed, serialize per installation, and observe actual request counts.
- **[Concurrent broad and targeted writes]** Installation replacement could race PR repair. → Use one installation-local reconciliation coordinator and compare provider freshness before applying.
- **[Verified delivery cannot be authorized yet]** Binding or provider identity may lag a correctly signed event. → Keep the original delivery in bounded-backoff `pending_verification`, surface sanitized unresolved counts, and retry after startup, binding, or repair.
- **[Bot finding exists only in prose]** Structured evidence would show zero blockers. → Treat prose as informational and require bots to create threads or `CHANGES_REQUESTED`; do not add text classification.
- **[Deployment SHA does not correlate]** Non-PR deployments cannot show a title. → Preserve the deployment and link its short SHA without guessing.
- **[Telemetry write volume]** Ten-minute no-op inserts add operational data. → Keep documents aggregate-only and automatically expire them after 14 days.

## Migration Plan

1. Add optional projection fields and the TTL-backed reconciliation-run collection/indexes before changing UI classification.
2. Project opened time, plural OpenSpec readiness with the deterministic legacy singular item, deployment correlation, and repository policy while retaining compatibility with old rows.
3. Persist verified deliveries before identity resolution and add retryable pending-verification state without clearing unresolved payloads.
4. Add targeted repair, coalescing, telemetry, one startup installation repair, manual controls, and the weekday scheduler; then remove the broad timer.
5. Switch the dashboard reducer, filters, ordering, and deployment headline after server snapshots supply the new evidence.
6. After deployment, explicitly verify GitHub App Pull requests, commit-status, and Checks read permissions, then under separate provider authorization add any missing `Checks: read` permission and subscriptions for review comments, resolved review threads, check runs, check suites, and commit statuses.
7. Run `Reconcile installation` once to populate repository policy and retry unresolved deliveries; until then, existing PRs cannot enter Mergeable. The first targeted repair backfills opened times, while unknown times remain last.

Rollback disables the weekday scheduler and new webhook-trigger routing, restores the prior dashboard reducer, and leaves optional MongoDB fields harmless. TTL telemetry expires automatically. Reverting GitHub App subscriptions is a separate provider operation and is not required for application rollback because unknown event pairs are ignored safely.
