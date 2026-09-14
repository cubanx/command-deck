## Context

See proposal.md for motivation and ../../aggregate-boundaries-discussion.md for the agreed decisions. Current storage contracts mandate embedded user activity. Current pagination reconstructs complete results from cached page bodies and continuation links on 304; moving validators alone loses data. The exact production latency breakdown remains unmeasured.

## Goals / Non-Goals

**Goals:** isolate reads and writes by ownership, preserve authorization and exact-head evidence, persist preferences, and reconstruct useful state from an empty database.

**Non-Goals:** data migration, dual writes, browser notifications, standalone OpenSpec tracking, new infrastructure, generic coordination frameworks, subscription reduction, or an unsupported absolute latency promise.

## Decisions

### Document ownership

| Document | Identity | Owned state |
| --- | --- | --- |
| User | GitHub user ID | Login/avatar and preferences.ui.dashboard |
| Installation | Installation ID | Verified account, permissions, active/suspended state, freshness |
| User-installation binding | User ID + installation ID | Authorized relationship and establishment time |
| Repository | Repository ID | Name, owner, default branch, policy/freshness, installation access relationships |
| PR | Repository ID + PR number | Title/author ID, refs/SHAs, lifecycle, bounded check/review summaries and embedded OpenSpec evidence |
| Deployment | Repository ID + deployment ID | Environment, SHA/ref, current ordered status, safe URLs, proven PR correlation |
| Webhook receipt | Provider + delivery ID | Intake, retry state, payload while incomplete, timing |
| Reconciliation run | Run ID | Scope, status, bounded progress/counts, sanitized failures and timing |
| Session / OAuth state / merge intent | Existing independent identities | Existing hashed, expiring, single-use or exact-head security contracts |

Use unique identity indexes and indexes matching authorization and actual repository/author/state queries. Represent every verified installation exposing a repository without duplicating the repository. Verify query plans against representative fixtures rather than add speculative indexes.

Use atomic field updates or per-document compare-and-set where needed. Separate PRs must not contend on a common user/repository replacement. Skip unchanged domain writes. Save accepted endpoint data and its validator together.

### Authorization and preferences

Read only required identity fields during authentication. Enforce verified approved active installation bindings on dashboard/detail reads, reconciliation requests and SSE delivery. Repository removal, suspension and binding revocation invalidate access; preferences never grant it. Preserve personal author filtering as the current dashboard presentation rule, not a separate repository authorization grant. Preserve guarded merge user/session/head checks.

Persist selected repository IDs, sort mode/direction and supported filter selections under user preferences. Validate field-level writes; restoring preferences must not trigger a competing default save. Use existing defaults when absent and show sanitized save/load errors. Local checkout handles, paths and activity remain browser-local.

### OpenSpec lifecycle

Embed evidence in the associated PR using exact-commit or unique-branch correlation. Keep merged-commit evidence and subsequent default-branch progress separately in that same document, with exact source commits. A removal or absent artifact is not proof of completion. Changes sharing a name across PRs do not share a mutable progress object. Ambiguous ownership remains unresolved/stale. Unassociated changes never appear, including through local overlays.

### Reconciliation and ETags

Reconcile each shared installation once, retaining installation-token verification, pagination, serial provider reads, timeouts and rate-limit behavior. Removal requires a complete listing for the relevant resource scope and must preserve concurrent newer evidence; installation-wide atomic replacement is unnecessary.

Validators belong with corresponding endpoint data and request/page/authorization scope. Prefer unconditional complete pagination when preserving cached pages would recreate duplicate response storage. Retain page evidence only for a demonstrated need. Never treat a page validator as validating an assembled collection or save a validator whose matching data was not accepted.

One run document records bounded diagnostics, without copying domain records. Propose 72 hours after completion as its diagnostic retention default; unfinished runs remain. Receipt retention is separately agreed at 72 hours after done/ignored processing, preserving pending and rejected receipts.

### Processing and consistency

Record intake, processing-start and completion times. Mark a receipt complete only after required effects succeed. Identify actual multi-document dependencies before adding coordination; most events should update one domain root. Repeatable updates and receipt retries handle interrupted required effects without a generic saga or blanket transaction requirement.

Use authoritative source versions/timestamps and exact head identities appropriate to each evidence type; arrival time is not provider recency. Preserve accepted evidence and request targeted repair when ordering is ambiguous. Test webhook/reconciliation conflicts and replay after receipt expiry. Ensure pending work progresses without manual reconciliation, and refresh authorized clients after relevant durable changes rather than waiting for unrelated backlog.

### Clean reconstruction

Bootstrap recovers open PRs, recent deployments and unfinished merged obligations. Discover active committed task artifacts on the default branch and establish merged PR owners through installation-token PR/commit evidence. Follow pagination and exact provenance; a recent-PR cutoff alone cannot prove absence of older unfinished work. Recover merge and current evidence as needed. Ambiguous association or incomplete discovery must be visibly stale/error. Test an older merged PR outside the deployment window and multiple PRs referring to the same change name.

### Notification removal

Remove producers, storage integration, snapshot reads, permission controls and popup delivery. Preserve authenticated SSE refresh and its native event framing. No scaffolding for future notifications.

## Risks / Trade-offs

- Incomplete reconstruction → test pagination, older obligations and ambiguous ownership; verify after reconnect.
- Shared data leakage → enforce installation and repository access on every read and stream, including revocation tests.
- Concurrent evidence loss → test per-document conflict handling and source ordering.
- More unconditional list reads → retain serial pagination/backoff; use conditional reads only with sufficient owned data.
- Short history → preserve unfinished receipts/runs and sanitized failure diagnostics.
- Mixed schema writers → quiesce old writers before clean cutover.
- Remaining latency → measure authentication, database reads, serialization, response size, queue wait and processing independently.

## Migration Plan

No migration. Before merge, prove empty-store initialization, connection, reconstruction and live refresh in an isolated test database. Prepare an exact-target runbook preserving existing hosted database-name guards.

After merge and applicable bounded production authorization, quiesce old writers and intake, reset the agreed application data in the named database, deploy and verify the exact revision, and initialize indexes. Resume intake, sign in, reconnect and reconcile. Reconcile again to cover the intake gap; do not assume automatic provider redelivery. Verify permissions, rebuilt cards, preferences, live updates and retention.

On failure, remain in maintenance or roll forward. Restoring an old runtime requires an explicitly authorized empty rebuild with its own schema; do not run it against new documents or claim discarded preferences/history can be restored.

## Implementation sequencing

The user published both task-owned changes together in PR #27 and then requested full implementation. Continue on that established PR branch, cd/expire-completed-deliveries, retaining the reported published-name mismatch instead of renaming it without authorization or creating a dependent PR. Its base is current main and both outgoing commits belong to this task. Align revised retention implementation and artifacts to 259200 seconds in this same change batch; no separate prerequisite merge is needed.
