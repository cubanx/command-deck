# Aggregate boundaries discussion

Status: design decisions recorded on 2026-09-13 and incorporated into [split-domain-documents](changes/split-domain-documents/proposal.md). Runtime implementation, review corrections, and local validation are complete and recorded in the change evidence. Production reset, deployment, and acceptance remain pending. Completed reconciliation runs and completed webhook receipts both use 72-hour retention.

## Agreed boundaries

- **User:** GitHub identity and personal preferences only. Add `preferences.ui.dashboard` for persistent repository selections using stable IDs, sort choices, and agreed dashboard preferences. Restore across reloads and devices; missing values use defaults. Update preference fields independently. GitHub ingestion must not modify preferences or embed GitHub activity here.
- **Installation:** one record per GitHub App installation containing owning account identity, granted permissions, and installation status. No embedded repositories or user identities.
- **User–Installation binding:** separate access relationship between user and installation, with establishment time. Removing a user's access does not delete shared installation data.
- **Repository:** one record per stable repository ID, with owner/name, default branch, repository policy, and policy freshness. Associate it with the installation providing access. No embedded PRs, deployments, or OpenSpec progress. Policy changes trigger affected PR reevaluation.
- **Pull request:** one record per repository ID and PR number. Own PR state and bounded lifecycle evidence. Head-specific evidence must remain consistent with the head SHA. Different PRs must not share a document write/conflict boundary.
- **OpenSpec evidence:** embed PR-specific change names, task groups, completion/obligation state, and source path/ref/commit in the PR. Do not introduce a shared mutable OpenSpec root by change name. The original PR document continues owning progress after merge: preserve evidence from the merged commit and track subsequent post-merge task progress separately with its exact default-branch source commit. Keep the PR card visible while obligations remain incomplete. OpenSpecs without an associated PR remain in Git and do not appear on the dashboard; do not create standalone Mongo documents for them.
- **Deployment:** one record per repository ID and deployment ID, containing environment, ref/SHA, current status and source timestamp, URLs, and known PR correlation. No unbounded status history. Older events must not overwrite newer status; any corresponding PR update must be repeatable.
- **Webhook delivery:** one receipt per delivery ID, owning durable intake, retry state, and deduplication. Keep payload while incomplete, sanitized failures, and timestamps sufficient to distinguish queue wait from processing time. **Retain done/ignored receipts for 72 hours after processing**, matching GitHub's documented three-day redelivery window. Preserve pending, pending-verification, and rejected records. Receipt expiry ends delivery-ID deduplication; safe replay and event ordering still require explicit design.

## Authentication and action records

- **Reconciliation run:** one document per run, owning installation/repository scope, status, start/finish times, progress, counts, and sanitized failures. Reference affected domain records without copying their data. Completed runs expire after 72 hours; unfinished runs remain.

- **Session:** retain a separate document per browser/device session, with hashed token identity, user ID, and expiration. Authentication rejects expired sessions immediately, independently of TTL cleanup.
- **OAuth state:** retain separate short-lived, single-use authorization state with hashed random identity, expiration, and only the context required to complete the flow.
- **Merge intent:** retain a separate short-lived authorization record bound to user/session, repository, PR, exact head SHA, stage, and expiration. Consume once; a changed head requires new authorization.

## Provider data and ETags

Store each ETag alongside the data it validates in the owning domain document. Preserve endpoint, request, and authorization scope; a PR may need separate validators for separate resources. Save corresponding data and its validator together. A 304 preserves that data; it must not turn into an empty result.

Remove the standalone generic provider cache wherever domain state supplies the required data. Do not retain duplicate raw responses without a demonstrated consumer need. The former `pagedGet` reconstructed results from cached page bodies and continuation links. The implementation now fetches pages unconditionally and retries bodyless 304 responses without interpreting them as empty data. An endpoint/page validator cannot validate an entire assembled collection; future conditional reads must retain the corresponding scoped data.

The generic provider cache has been removed from runtime; no cache bodies are added to the user document.

## Notification decision

PR cards are sufficient; do not build an in-app notification inbox. The redesign removes notification producers, storage integration, snapshot notification reads, and notification UI/delivery code while preserving live card refresh independently. The former Enable Notifications control requested browser notification permission; stored notification records fed browser notifications while the app was running. That was not an in-app inbox. The user reports browser notifications have never worked, but would welcome working browser notifications later. Defer that feature; do not retain unused notification infrastructure for it. Production data deletion requires the separately authorized rollout procedure.

## Retention follow-through

The `expire-completed-deliveries` implementation, proposal, design, specs, and tests now use three days (259200 seconds), with local native-TTL validation recorded in the change evidence. Production retention verification remains pending; this discussion does not authorize deployment. GitHub reference: https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/redelivering-webhooks.

## Shared data and access

Store each repository, PR, and deployment once. Every dashboard request is restricted server-side to repositories exposed by the user's authorized installation bindings. Everyone bound to an installation may see all repositories it exposes. Repository selections only narrow this authorized set; preferences never grant access. Removing a binding removes that user's access without deleting shared domain data.

## Consistency between documents

Use atomic updates within each domain document. Only coordinate multiple domain writes when an identified behavior actually requires them; the user expects fewer such dependencies after correcting aggregate boundaries. Do not assume deployment completion always requires a PR write or build a generic coordination framework in anticipation.

Where an event genuinely requires multiple updates, allow a brief intermediate state and make every update safe to repeat. Mark its webhook receipt complete only after all required updates succeed, so a retry can finish interrupted processing. Prevent older evidence from overwriting newer state. Identify concrete dependencies and their ordering evidence during implementation; no blanket multi-document transaction requirement.

## Clean-start rollout

Do not migrate or backfill the existing Mongo documents, and do not implement dual reads or dual writes. Start with an empty application database using the new document model. Users sign in, reconnect installations, and reconcile to rebuild GitHub and associated OpenSpec data. Existing sessions, preferences, and operational history are not carried forward. Reconciliation must rebuild the agreed dashboard state, including merged PRs with incomplete post-merge obligations; incoming webhooks supply subsequent changes.

This is the agreed rollout design, not evidence of an executed reset. The [clean-start runbook](changes/split-domain-documents/clean-start-runbook.md) records the target and procedure; both require fresh verification and applicable authorization before live operations.

## Remaining work

- Publish review corrections and complete GitHub review closure.
- Execute and verify the clean-start rollout after merge and production authorization.
- Measure production UI and processing latency; local measurements do not establish a production speedup.

## Evidence motivating the redesign

The pre-refactor application repeatedly loaded the user aggregate containing installations, repositories, PRs, OpenSpec evidence, and deployments. Snapshot authentication and dashboard assembly each fetched the full user document; webhook verification/projection also read aggregate state. The inbox drain remains globally sequential. Production snapshot requests were about 8.8 seconds. The user's Atlas lookup returned one document through the ID index with reported execution time of zero milliseconds, while full-document Find took about five seconds and a projection of ID/login appeared instant. This implicates full-document retrieval but does not isolate transfer, Atlas rendering, throttling, or application processing time. Do not claim the precise production bottleneck has been measured.
