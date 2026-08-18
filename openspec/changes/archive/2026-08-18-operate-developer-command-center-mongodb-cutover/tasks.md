## 1. Prerequisite and Plan Gates

- [x] 1.1 Fetch current `main` read-only, verify the exact `replace-sqlite-with-mongodb`, `rename-command-center-identifiers`, and `fix-installation-identity` merge SHAs are present, and confirm their reviewed implementation, checks, and OpenSpec artifacts are complete; accept the installation identity fix SHA as the deployment source and stop on any mismatch.
- [x] 1.2 Confirm `operate-developer-command-center-production` has no executed production tasks, then retire it as superseded with spec synchronization skipped and verify it no longer appears as a competing active operation.
- [x] 1.3 Strictly validate this cutover change from current `main` and confirm no migration implementation, observation window, or destructive storage cleanup is hidden in its scope; require separate production authorization after the merge gate.

## 2. Authorized Production Preflight

- [x] 2.1 Before requesting production access, record the exact Railway project/environment/service target, shared MongoDB target database, intended read and mutation operations, expected foundation SHA, and rollback revisions/configuration.
- [x] 2.2 With fresh task-scoped Railway production authorization, verify source-trigger behavior, current deployment identity, service/write state, readiness settings, SQLite volume attachment, and the exact rollback target; stop on unexpected or ambiguous state.
- [x] 2.3 With fresh task-scoped MongoDB production authorization, verify the target database identity, credential scope/destination, network access, required privileges, and that the target is empty or explicitly isolated for this service; stop rather than overwrite existing data.
- [x] 2.4 Confirm the GitHub App installation-token path and callback/webhook endpoints match the reviewed runtime without changing GitHub provider configuration.
- [x] 2.5 After `rename-command-center-identifiers` and `fix-installation-identity` merge, refresh current `main`, verify both exact merge SHAs contain their reviewed code, tests, and strict-valid OpenSpecs, and accept the verified `fix-installation-identity` SHA as the deployment source; retain separate production authorization and stop before task 3.1 on any mismatch.
- [x] 2.6 With fresh task-scoped authorization, reconcile and verify Atlas project `command-center-ai`, cluster `command-center-ai`, shared target database `command-center-ai-production`, runtime user `command-center-ai-production-runtime` with only `readWrite` on that database, and the matching approved 1Password projection in the exact Railway target; do not quiesce SQLite until fresh least-privilege behavior is proven.

## 3. Quiesce and Hand Off Bindings

- [x] 3.1 Stop the old application and webhook writes if they exist, then verify no process is mutating SQLite before reading the handoff.
- [x] 3.2 Query only GitHub user ID, installation ID, and installation account login for every SQLite binding; expose no other rows, tokens, payloads, caches, or secrets.
- [x] 3.3 Verify the result contains exactly one user, distinct installation IDs, complete fields, and only exact account logins `cubanx`, `Crisp-Inc`, or `hudson-law`; reconstruct only the observed missing login for `(362276, 153423118)` as exact `Crisp-Inc` after authoritative installation ownership proof and interactive user confirmation; stop on every other missing, duplicate, conflicting, additional-user, or unapproved datum.
- [x] 3.4 Record the user-confirmed tuple `(362276, 153423118, Crisp-Inc)` and accept the active final state without replaying seed; do not claim seed ran.
- [x] 3.5 Record the observed single user and exact binding in the active final state; do not infer a historical partial seed or retry.

## 4. Configure, Deploy, and Bootstrap

- [x] 4.1 With fresh task-scoped authorization, confirm the MongoDB runtime variables and deployment settings in the exact Railway target select the verified `command-center-ai-production` credential projection for the exact verified `fix-installation-identity` SHA while leaving the old SQLite volume and rollback configurations intact.
- [x] 4.2 Record active exact SHA `5e639911a5a2efd32153877c3b08be279f266510` with `/health` and `/ready`; do not claim deployment/endpoint ordering before traffic.
- [x] 4.3 Have the user complete one ordinary GitHub sign-in, verify a hashed session and current identity are created, and prove every seeded installation binding remains unchanged without an installation/setup flow.
- [x] 4.4 Record active `153423118` / `Crisp-Inc` and populated projections; do not claim bootstrap or installation-token execution.

## 5. Activation Verification

- [x] 5.1 Record one signed-in user, exact accepted binding, and observed authorized repositories; do not claim cross-user denial.
- [x] 5.2 Record rendered MongoDB dashboard and deployment projections; retain unknown Actions/checks/reviews and unavailable Codex activity as non-acceptance fields.
- [x] 5.3 Record one accepted signed delivery and one redelivery with one stored inbox delivery; do not claim rejected-signature, retry, fan-out, or exhaustive semantics.
- [x] 5.4 Record provider-cache `299 -> 313` and already-running `202` responses as a non-blocking reliability follow-up; do not claim completion, retry recovery, or complete-snapshot semantics.
- [x] 5.5 Record hashed session projection, empty `oauth_states`, absent raw session-token fields, and inbox payload absence; do not claim provider-cache body safety or exhaustive SQLite exclusion.

## 6. Complete or Roll Back

- [x] 6.1 Record no rollback because core final-state acceptance passed; preserve SQLite rollback deployment, configuration, and volume without copying or deleting either store.
- [x] 6.2 Record prerequisite SHA, target identities, accepted binding, bounded final-state verification, and successful activation disposition; distinguish unobserved seed/deployment/bootstrap history.
- [x] 6.3 Leave the SQLite volume and MongoDB database intact; document that any later destructive cleanup requires a separate explicit authorization and is not part of this change.
- [x] 6.4 Run strict validation, mark only rewritten final-state-evidence tasks complete, and record user-directed human review/archive approval dated `2026-08-18` before archive without canonical spec sync.
