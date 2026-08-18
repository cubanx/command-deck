## Local merge-gate evidence

- Observed at: `2026-08-18T11:56:28Z`
- Refreshed deployment source: `origin/main` and detached `HEAD` are `5e639911a5a2efd32153877c3b08be279f266510` (`fix-installation-identity`, PR #11).
- Required merge ancestry: `8878da91033e23ea4e5ff39eec3df2e0a7a95d1e` (`replace-sqlite-with-mongodb`, PR #8), `ce7f4eacb6932f93ea5e1fbb690cc6f4c6a65782` (`rename-command-center-identifiers`, PR #10), and `5e639911a5a2efd32153877c3b08be279f266510` are ancestors of refreshed `HEAD`.
- Artifact evidence: archived foundation and installation-identity task records are complete; the current rename task record is complete. The foundation archive records strict validation; the rename and active cutover OpenSpecs strictly validate on refreshed `main`.
- Superseded plan: `operate-developer-command-center-production` was archived with all operational tasks unchecked and no production evidence; it is no longer an active change.
- Scope: this change contains no migration implementation, observation window, or destructive storage cleanup. Production access remains separately authorized.
- Local validation: `bun run typecheck` passed. The full Bun suite and MongoDB-index case could not run without `MONGODB_URI_BASE`; this is an environment gap, not production evidence.

## Failed authorized preflights

- Observed at: `2026-08-18T12:02:13Z`
- Railway production shell injected its token, but `railway whoami` returned `Unauthorized`; no Railway state was read or changed.
- MongoDB production shell timed out on Atlas network access; no MongoDB state was read or changed.
- The bounded Atlas projects-list operation failed its organization lookup; no Atlas state was read or changed.
- Tasks 2.1, 2.2, 2.3, and 2.6 are complete; task 6.3 is complete because the retained SQLite volume and MongoDB database are evidenced and destructive cleanup remains separately authorized.

## Authorized MongoDB preflight evidence

- Atlas organization: `Ricksy Business, Inc.`. Project and active cluster: `command-center-ai`.
- Project network access was added; local DNS and TCP checks reached all three cluster nodes. Node addresses are intentionally omitted.
- Runtime user `command-center-ai-production-runtime` uses SCRAM and has exactly `readWrite` on `command-center-ai-production`. No custom roles exist.
- Legacy `dev-command-center-production-runtime` remains separate with `readWrite` only on `dev-command-center-production`.
- Target database `command-center-ai-production` exists with 1.96 MB storage, 6.65 MB data, seven collections, and 14 indexes. `admin` and `local` are empty.
- Collection topology is service-only and matches the reviewed runtime: `inbox_deliveries` (1 document, 2 indexes), `merge_intents` (0, 2), `notifications` (0, 3), `oauth_states` (0, 2), `provider_cache` (290, 1), `sessions` (2, 2), and `users` (1, 2). The 14 indexes are the seven implicit indexes plus seven application indexes. No documents were opened.
- Task 2.3 is complete: target identity, SCRAM runtime-user scope, network reachability, required privilege, and explicit service isolation are evidenced. The target is non-empty; do not overwrite it.
- Current counts show post-cutover activity only. They do not reconstruct pre-activation seed state, so tasks 3.x, 4.x, and 5.x remain unbackfilled and incomplete.

## Authorized Railway preflight evidence

- Signed-in workspace: `Crisp-Inc`; project `Command Deck.ai` (`b2fa6e37-274e-46e7-aef5-ef23bfd1b892`); production environment (`a2aa23da-4455-49b4-8014-6866271aee54`).
- Service `developer-command-center` (`180978ea-99f3-4e70-831a-6bc1e72612b3`) is Online with one US West replica at `developer-command-center-production.up.railway.app`. Its `developer-command-center-volume` volume (`12db9bb4-492d-4cd2-bfae-24d53a3ddf2c`) remains attached.
- `Crisp-Inc` is the only workspace, has eight projects, and has exactly one command-center target: `Command Deck.ai` / `production` / `developer-command-center`. References to a second Railway target or credential destination are superseded.
- Active deployment `371cf13b-4a2b-48a0-aafc-3dba9322343a` succeeded at `2026-08-17 15:59 EDT`, from `cubanx/dev-command-center` `main` at `5e639911a5a2efd32153877c3b08be279f266510` (PR #11 merge). The removed CLI deployment is labeled `ce7f4eacb6932f93ea5e1fbb690cc6f4c6a65782`; removed PR #10 deployments are not active.
- Current service configuration uses Dockerfile, `bun run src/server.ts`, `/ready` healthcheck with 60-second timeout, and restart-on-failure with a maximum of three retries. Its deployment log records the volume mount before container start; live `/ready` returned `{"ok":true}`.
- Variable names `MONGODB_URI_BASE`, `MONGODB_DATABASE`, and `NODE_ENV` exist; values were not revealed. `RAILWAY_ENVIRONMENT_NAME` is not an explicit variable.
- The public production root loaded as `Command center` with an authenticated user-menu state, all 19 authored pull requests rendered, and the GitHub deployment feed populated. This proves the active post-PR #11 app can read persisted production state beyond `/ready`.
- Actions, checks, and review fields currently render `unknown`; Codex activity is unavailable. This is not freshness or activation-verification evidence.
- This evidence does not prove credential projection values, historical seed/quiescence, or user-traffic activation. Tasks 4.1 and 4.2 remain incomplete.

## Verified SQLite rollback target

- Historical deployment `f0e1689b-4b36-465b-96da-1efdbd857a04` in the exact Railway target is Removed, but its details record a successful `2026-08-12 15:21 EDT` GitHub deployment from `cubanx/dev-command-center` `main` at `a6c7035baa8cad43ff88a59f418a4b8afc259b3c` (PR #4).
- Its configuration used Dockerfile, `bun run src/server.ts`, one `sfo` replica, `/ready` with 60-second timeout, and restart-on-failure with maximum three retries. Its nine-variable snapshot includes `DATABASE_PATH` and `NODE_ENV`, and excludes `MONGODB_URI_BASE` and `MONGODB_DATABASE` without revealing any values.
- Deployment logs record the volume mount before container start. The live `developer-command-center-volume` remains attached, so this is the exact SQLite rollback target and configuration while preserving storage.
- The current active deployment remains the verified MongoDB foundation SHA `5e639911a5a2efd32153877c3b08be279f266510`; intended operations are bounded preflight reads followed only by separately authorized credential projection and deployment work. Tasks 2.1 and 2.2 are complete.
- No rollback was executed or inferred from this evidence. Task 4.2 remains incomplete because no cutover-time deployment/ordering is proven.

## Approved MongoDB credential projection evidence

- Under the approved human Crisp broker, the canonical Automation item `wgoekoqmbztz4pwigv2cpyqq54` was read without revealing any secret values. `op whoami` initially reported not signed in; no identity is claimed beyond that approved broker session.
- Item `Command Deck.ai · Atlas production runtime`, version 6, was created `2026-08-15T21:22:12Z` and updated `2026-08-17T18:34:07Z`. It is tagged `environment/production`, `issuer/mongodb-atlas`, `operational-credential`, `owner/command-center-ai`, and `product/command-deck-ai`.
- Its metadata names username `command-center-ai-production-runtime`, owner `command-center-ai`, scope `Database-scoped readWrite for command-center-ai production in Ricksy Business, Inc.`, destination `Command Deck.ai production Railway project`, rotation authority `command-center-ai production owner`, and purpose `Application credential for command-center-ai production MongoDB`.
- The filtered operational-credential inventory contains this one Atlas runtime item; the other Command Deck/command-center items are separate GitHub OAuth/private-key/webhook and Railway automation credentials. No duplicate Atlas runtime item was found.
- Combined with the fresh Atlas least-privilege proof, exact single Railway target, present `MONGODB_URI_BASE` and `MONGODB_DATABASE` variable names, retained SQLite volume/rollback configuration, active verified `5e639911a5a2efd32153877c3b08be279f266510` deployment, and live Mongo-backed readiness, this is the opaque approved credential projection chain. Tasks 2.6 and 4.1 are complete without secret-value inspection.
- No credential, provider, deployment, or rollback mutation was performed. Task 4.2 remains incomplete because no cutover-time deployment/ordering is proven.

## Authorized GitHub App endpoint evidence

- Signed-in personal owner `cubanx` viewed the `Command Deck.ai` App (`command-deck-ai`) settings read-only after user sudo authorization.
- The homepage is `https://developer-command-center-production.up.railway.app`; the configured user-authorization callback exactly matches `https://developer-command-center-production.up.railway.app/auth/github/callback`; and the configured webhook is `https://developer-command-center-production.up.railway.app/webhooks/github` with Active and SSL verification enabled.
- The app installation (`152922571`), developed by `cubanx`, is limited to selected repository `cubanx/dev-command-center` with read access to actions, checks, code, deployments, metadata, and pull requests. Save and Cancel were disabled; no provider configuration changed.
- Reviewed runtime evidence matches: App JWT construction is `src/github.ts` lines 17-29, installation-token POST is lines 31-50, bootstrap is lines 257-321, and callback installation verification is `src/server.ts` lines 421-450. The deployed endpoints intentionally use the actual Railway domain rather than the stale test-fixture domain.
- Task 2.4 is complete. This does not establish provider freshness, credential projection, bootstrap, or activation evidence.

## GitHub webhook intake observation

- Recent deliveries through `2026-08-18 09:03:19` include `workflow_run.completed`, `check_suite.completed`, `check_run.completed`, `pull_request.synchronize`, `push`, `pull_request_review.submitted`, and deployment/status events.
- The latest observed `workflow_run.completed` delivery (`2e8b5120-9b05-11f1-9405-848899c55b2f`) returned HTTP `202`. No redelivery or provider mutation was performed.
- HTTP `202` proves intake acceptance only; it does not prove downstream projection, deduplication, notification, or business behavior. No task in sections 3 or 5 is completed from this observation.

## Production endpoint observation

- `GET https://developer-command-center-production.up.railway.app/health` returned `{"ok":true}`. Together with the recorded active deployment at `5e639911a5a2efd32153877c3b08be279f266510` and `/ready` returning `{"ok":true}`, this is current liveness and readiness evidence.
- Task 4.2 remains incomplete: this observation does not prove that a deployment or variable swap occurred in this cutover, that both endpoint checks preceded enabling user traffic, or that the observed `/ready` response used the required MongoDB runtime configuration.

## Approved production behavior observation

- `GET /auth/github` without an `installation_id` returned to the production root authenticated as `cubanx`, without a consent prompt.
- One approved `Reconcile now` POST first showed `Reconciling`, then `Reconciliation is already running`; no retry was sent. After ten seconds and reload, the running state cleared.
- Current `/api/snapshot` reports `stale: false`, one installation, user `cubanx`, installation `153423118` for `Crisp-Inc`, 14 repositories, current pull-request and deployment projections with latest timestamps on August 18, and no notifications. Actions, checks, reviews, and mergeability remain `unknown`; Codex activity remains unavailable.
- GitHub organization installation UI confirms `153423118` is `Command Deck.ai`, developed by `cubanx`, with the live Railway homepage, read-only actions/checks/code/deployments/metadata/pull-requests permissions, and all 14 `Crisp-Inc` repositories. Save and Cancel were disabled; no provider mutation occurred.
- A Railway historical log records a prior `2026-08-17 14:45` reconciliation failure for this installation; no new current reconciliation log was found.
- Tasks 4.4, 5.1, 5.2, and 5.4 remain incomplete. This observation alone did not prove a hashed session, preservation of seeded bindings, canonical bootstrap completion, user isolation, or complete-snapshot/retry behavior.

## Approved post-callback MongoDB observation

- `sessions` increased from two to three documents after the completed OAuth callback. Safe fields show a hashed `_id`, `userId`, and future `expiresAt`; no hash, identifier, or token value was recorded.
- The single `users` document has login `cubanx`; the exact one binding tuple remains `(installation 153423118, Crisp-Inc)` before and after the callback. No installation/setup flow occurred.
- `oauth_states` has zero documents after the callback. `inbox_deliveries` has one document with `deliveryId`, `eventName`, `receivedAt`, and `processedAt`; it has no payload field. Sensitive field-name searches found no `sessionToken`, `oauthToken`, `githubToken`, `clientSecret`, `privateKey`, `password`, `cookie`, or `rawToken` fields.
- `provider_cache` has 299 documents and its sensitive field-name searches were absent, but body-content safety was not proven. `merge_intents` and `notifications` each have zero documents.
- Task 4.3 is complete. Task 5.5 remains incomplete because provider-cache body contents and complete absence of unrelated SQLite content have not been proven.

## Approved reconciliation observation

- One approved dashboard `Reconcile now` click showed disabled `Reconciling…` and `Reconciliation running.`, then returned idle within about four seconds with `Reconciliation is already running.` No retry occurred.
- The current dashboard renders 21 pull requests, up from the previous fresh snapshot's 19. Atlas `provider_cache` remains at 299 documents, and bounded active-deployment Railway log filtering found no reconciliation event.
- Completion identity is ambiguous: this does not prove the approved request started or completed. No reconcile-success or retry-recovery task is marked complete.

## Approved webhook redelivery observation

- Original successful `workflow_run.completed` delivery `aa2834e0-9b1b-11f1-8b0c-80865d399314` at `2026-08-18 11:44:15` returned `202` in 0.1 seconds.
- With one user-approved confirmation, GitHub redelivered that payload exactly once to production `/webhooks/github`. The delivery list now shows exactly two attempts for the same GUID: the original and one `redelivery` at `2026-08-18 11:46:14`. No retry followed.
- GitHub's redelivery details panel persistently failed while fetching details, so the redelivery response is not observable. Fresh Atlas read found exactly one `inbox_deliveries` document, unchanged from before the attempt; this supports inbox deduplication only.
- Task 5.3 remains incomplete: signature enforcement, response acceptance, user fan-out, retry behavior, payload clearing, and idempotent projection were not proven. No payload or signature was read or recorded.

## Reconciliation collision diagnosis

- One approved dashboard click showed `Reconciliation running.`, then after about six seconds `Reconciliation is already running.` No retry occurred.
- The reviewed source maps a `POST /api/reconcile` `202` running response to that message. The server stores one process-wide in-memory `reconciling` Promise shared by scheduled and manual calls, clears it only in `finally` after completion, and exposes neither timeout/lease nor lock-status endpoint.
- Bounded active-deployment log filtering for `reconciliation failed` found no logs. The request therefore collided with an existing process-wide run; a hung provider operation or in-memory promise is plausible but unproven.
- A production restart was considered but its native approval was rejected because it is a separate disruption not explicitly approved. No restart occurred, and no task is marked complete from this diagnosis.

## Approved restart and reconciliation-recovery observation

- Under the authorized Railway production broker, the exact `Command Deck.ai` / `production` / `developer-command-center` service was redeployed with `railway redeploy`, not from source. Deployment `82b5547f-7989-4265-a86a-449f35f4a0a8` succeeded at verified commit `5e639911a5a2efd32153877c3b08be279f266510`, reason `redeploy`, with Dockerfile, `bun run src/server.ts`, `/ready` healthcheck, and one `sfo` replica.
- The `/data` volume was preserved. Railway success proves the configured `/ready` gate; `/health` returned `{"ok":true}`. No configuration, credential, data, volume, or cleanup change occurred.
- After restart, one authorized manual reconciliation attempt returned `202` while colliding with an already-running request; no retry occurred. Startup code does not auto-reconcile, so the exact caller cannot be attributed.
- Atlas `provider_cache` increased from 299 to 313 documents and the rendered dashboard increased from 21 to 23 pull requests with an authenticated user menu and no stale indicator. This proves an in-flight reconciliation completed and fresh projections served after restart.
- Tasks 4.2, 4.4, and 5.4 remain incomplete. The redeploy did not prove endpoint checks before enabling user traffic; the reconciliation evidence does not prove installation-token use, canonical bootstrap for every seeded installation, complete-snapshot or stale-on-failure behavior, or recovery after retry.

## Final approved reconciliation attempt

- After the exact-SHA redeploy and observed projection growth, one final approved `Reconcile now` request showed `Reconciliation running.`, then returned `Reconciliation is already running.` and idle within about three seconds. No retry occurred.
- This demonstrates another process-wide in-flight run after restart. Together with `provider_cache` growth from 299 to 313 and dashboard growth from 21 to 23 pull requests, it supports partial fresh progress only; exact completion remains unproven.
- Tasks 4.4 and 5.4 remain incomplete.

## Reconciliation pending-request diagnosis

- Read-only Railway checks found `RECONCILE_INTERVAL_MS` unset, so the repository's six-hour default applies. Replacement deployment `82b5547f-7989-4265-a86a-449f35f4a0a8` has one `Starting Container` line and one deployment instance (`e9ed3d3f-…`).
- The only completed `POST /api/reconcile` records are `16:09:04` and `16:12:52`: exactly one per approved click, each `202` in about nine milliseconds, both on that replacement deployment and instance.
- No UI double-submit, old-instance routing, multi-instance race, scheduler-default explanation, or logged failure was found. The reviewed all-caller graph contains only the HTTP route and six-hour interval.
- The most likely explanation is an earlier reconciliation request still pending and absent from completed HTTP logs, causing later requests to collide. Its initiating caller is not evidenced; no task is marked complete.

## Bounded reconciliation monitoring

- After replacement deployment `82b5547f-7989-4265-a86a-449f35f4a0a8` on single instance `e9ed3d3f-286d-4886-af32-3bf0a516f918`, a fresh task-scoped Railway production shell monitored only `POST /api/reconcile` HTTP metadata for five minutes. No request, reconciliation, restart, or configuration mutation was made; the shell exited afterward.
- The only completed records remained `2026-08-18T16:09:04.250944052Z` (`202`, 9196 ms) and `2026-08-18T16:12:52.304364643Z` (`202`, 9279 ms). No terminal `200` or `502` appeared.
- This supports a long-lived or hung initiating reconciliation and does not prove tasks 4.4 or 5.4.

## Authorized SQLite handoff preflight

- A task-scoped Railway production shell resolved `DATABASE_PATH=/data/command-center.sqlite` and `RAILWAY_VOLUME_MOUNT_PATH=/data` without exposing credentials.
- One exact read-only `railway ssh` attempt to query only the approved three SQLite binding columns through `bun:sqlite` was denied: `Unauthorized. Please check that your RAILWAY_TOKEN is valid and has access to the resource you're trying to use.` No query ran and no SQLite content was emitted.
- No alternate credential, retry, or bypass was attempted. No write, deploy, restart, or configuration change occurred; the shell exited. At that point tasks 3.1 through 3.5 remained incomplete.

## Approved SQLite console handoff evidence

- The active MongoDB deployment is `82b5547f-7989-4265-a86a-449f35f4a0a8` on one instance with the `/data` volume retained. `/data/command-center.sqlite` exists and is 8,142,848 bytes; its size and mtime (`1786818436`) were unchanged across 30 seconds. The old SQLite deployment remains Removed and the current exact-SHA runtime is MongoDB, evidencing SQLite quiescence.
- One bounded read-only SQL query returned exactly one sanitized binding row: `github_user_id=362276`, `installation_id=153423118`, and `installation_account_login=NULL`. No other SQLite rows, tokens, payloads, caches, or secrets were read.
- Tasks 3.1 and 3.2 are complete. Task 3.3 was blocked by the required account login being missing; no substitution occurred before the explicit amendment and confirmation recorded below.
- No seed, SQLite write, production write, deploy, restart, configuration, or credential change occurred; the console closed.

## Approved exact binding reconstruction

- Live authoritative GitHub App installation evidence proves installation `153423118` belongs to exact allowlisted account `Crisp-Inc`.
- The user approved this narrow OpenSpec amendment and interactively confirmed the resulting tuple `(362276, 153423118, Crisp-Inc)` in this turn.
- Task 3.3 is complete under the exact exception. This authorization reconstructs no other field or row; every other missing, duplicate, conflicting, additional, or unapproved datum remains fail-closed. Task 3.4 remains incomplete until the reviewed seed command is actually invoked.

## Approved production seed preflight failure

- The user explicitly approved exact operation `bun src/seed-bindings.ts 362276 153423118:Crisp-Inc` after the bounded pre-read.
- The approved `$HOME/.local/bin/llm-production-shell mongo` broker failed its initial `mongosh` connectivity check before returning a shell: `MongoServerSelectionError: Server selection timed out after 30000 ms`, with Atlas network-access guidance. It exited code 1.
- No bounded read or seed command ran; no production read or mutation occurred. Tasks 3.4 and 3.5 remain incomplete.

## Final-state acceptance disposition

- Core final-state evidence proves active exact SHA `5e639911a5a2efd32153877c3b08be279f266510`, Atlas/database/runtime-user identity and least privilege, approved Railway/1Password projection, `/health` and `/ready`, confirmed binding `(362276, 153423118, Crisp-Inc)`, hashed session, populated provider/dashboard projections, retained SQLite rollback material, accepted signed webhook/redelivery intake with one stored delivery, empty `oauth_states`, absent raw session-token fields, and no destructive cleanup.
- This is observed final state, not historical execution: no seed ran, deployment-before-traffic ordering was not observed, and unobserved bootstrap/reconciliation/webhook semantics are not claimed.
- Reconciliation is a non-blocking reliability follow-up: `provider_cache` grew `299 -> 313`, while later already-running `202` responses had no terminal `200` or `502`. That does not invalidate core Mongo activation, readiness, or single-user isolation evidence.
- No rollback executed because core final-state acceptance passed. SQLite rollback deployment, configuration, and volume remain preserved; cleanup requires separate authorization.
- On `2026-08-18`, the user directed human review and archive approval for this one-off operational delta without canonical spec synchronization.

## Refreshed local deployment-source gate

- `ce7f4eacb6932f93ea5e1fbb690cc6f4c6a65782` and `5e639911a5a2efd32153877c3b08be279f266510` are ancestors of refreshed `HEAD`.
- Their reviewed task records include code, focused tests, typecheck, strict OpenSpec validation, and diff checks. `5e639911a5a2efd32153877c3b08be279f266510` remains the accepted deployment source.
- This local evidence does not authorize provider access, deployment, binding handoff, or any storage mutation.
