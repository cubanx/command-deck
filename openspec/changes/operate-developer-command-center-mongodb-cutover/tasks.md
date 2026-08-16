## 1. Prerequisite and Plan Gates

- [ ] 1.1 Fetch current `main` read-only, verify the exact `replace-sqlite-with-mongodb` merge SHA is present, and confirm its reviewed implementation, checks, OpenSpec, and seed command are complete; stop on any mismatch.
- [ ] 1.2 Confirm `operate-developer-command-center-production` has no executed production tasks, then retire it as superseded with spec synchronization skipped and verify it no longer appears as a competing active operation.
- [ ] 1.3 Strictly validate this cutover change from current `main` and confirm no code PR, migration implementation, observation window, or destructive storage cleanup is hidden in its scope.

## 2. Authorized Production Preflight

- [ ] 2.1 Before requesting production access, record both exact Railway project/environment/service targets, the shared MongoDB target database, intended read and mutation operations, expected foundation SHA, and rollback revisions/configuration.
- [ ] 2.2 With fresh task-scoped Railway production authorization, verify source-trigger behavior, current deployment identity, service/write state, readiness settings, SQLite volume attachment, and the exact rollback target in both projects; stop on unexpected or ambiguous state.
- [ ] 2.3 With fresh task-scoped MongoDB production authorization, verify the target database identity, credential scope/destination, network access, required privileges, and that the target is empty or explicitly isolated for this service; stop rather than overwrite existing data.
- [ ] 2.4 Confirm the GitHub App installation-token path and callback/webhook endpoints match the reviewed runtime without changing GitHub provider configuration.
- [ ] 2.5 After `rename-command-center-identifiers` merges, refresh current `main`, verify its exact merge SHA contains the reviewed code, tests, and strict-valid OpenSpec, and accept that SHA as the deployment source; stop before task 3.1 on any mismatch.
- [ ] 2.6 With fresh task-scoped authorization, reconcile and verify Atlas project `command-center-ai`, cluster `command-center-ai`, shared target database `command-center-ai-production`, runtime user `command-center-ai-production-runtime` with only `readWrite` on that database, and the matching approved 1Password projection in both Railway projects; do not quiesce SQLite until fresh least-privilege behavior is proven.

## 3. Quiesce and Hand Off Bindings

- [ ] 3.1 Stop the old application and webhook writes if they exist, then verify no process is mutating SQLite before reading the handoff.
- [ ] 3.2 Query only GitHub user ID, installation ID, and installation account login for every SQLite binding; expose no other rows, tokens, payloads, caches, or secrets.
- [ ] 3.3 Verify the result contains exactly one user, distinct installation IDs, complete fields, and only exact account logins `cubanx`, `Crisp-Inc`, or `hudson-law`; stop on missing, duplicate, conflicting, additional-user, or unapproved data.
- [ ] 3.4 Present the bounded binding set for the user's interactive confirmation, then invoke the reviewed seed command once through the authorized MongoDB environment.
- [ ] 3.5 Verify one partial user aggregate contains exactly the confirmed bindings and no repositories, projections, sessions, notifications, inbox deliveries, cache history, or copied SQLite data; use the command's idempotent retry only if the first result is uncertain.

## 4. Configure, Deploy, and Bootstrap

- [ ] 4.1 With fresh task-scoped authorization, confirm the MongoDB runtime variables and deployment settings in both Railway projects select the same verified `command-center-ai-production` credential projection for the exact verified rename SHA while leaving the old SQLite volume and rollback configurations intact.
- [ ] 4.2 Deploy only the verified rename merge SHA and confirm `/health` liveness plus MongoDB-backed `/ready` before enabling user traffic.
- [ ] 4.3 Have the user complete one ordinary GitHub sign-in, verify a hashed session and current identity are created, and prove every seeded installation binding remains unchanged without an installation/setup flow.
- [ ] 4.4 Run canonical bootstrap or reconciliation for every seeded installation using installation-scoped tokens; stop if an installation/account is missing, unapproved, inaccessible, incomplete, or inconsistent.

## 5. Activation Verification

- [ ] 5.1 Verify the signed-in user sees only authorized repositories and personal projections from every seeded installation, with no cross-user or unbound installation data.
- [ ] 5.2 Verify dashboard attention, OpenSpec, deployment, and notification behavior against the MongoDB projection without relying on legacy SQLite rows.
- [ ] 5.3 Send or replay one bounded signed webhook test through the approved path and verify signature enforcement, global delivery deduplication, user fan-out, retry behavior, payload clearing, and idempotent projection.
- [ ] 5.4 Trigger one bounded reconciliation and verify complete-snapshot behavior, stale-on-failure preservation, installation-token use, and recovery after retry.
- [ ] 5.5 Verify no raw session token, OAuth state, GitHub OAuth user token, or unrelated SQLite content is persisted in MongoDB, then record activation evidence without secret values.

## 6. Complete or Roll Back

- [ ] 6.1 If any deployment, sign-in, bootstrap, readiness, isolation, authorization, webhook, notification, or reconciliation check fails, restore the prior revision and SQLite configuration and verify its readiness without copying MongoDB writes back or deleting either store.
- [ ] 6.2 If every check passes, record both prerequisite merge SHAs, target identities, binding count and allowlist result, seed/deployment/bootstrap identities, verification results, and successful activation disposition.
- [ ] 6.3 Leave the SQLite volume and MongoDB database intact; document that any later destructive cleanup requires a separate explicit authorization and is not part of this change.
- [ ] 6.4 Run strict OpenSpec validation, mark only evidence-backed tasks complete, and stop for human review before archiving the completed operational change.
