# Implementation evidence

Final pre-merge result: all 279 tests and both Playwright journeys pass, and the complete validation manifest succeeds with no functions above the complexity threshold. All 27 pre-merge tasks are complete. Earlier failures below are chronological checkpoints, not current findings. Production clean-start tasks remain unchecked.

## Group 1: scope and baseline

Baseline HEAD: 5d677e95e7e74d33a8aa2983fddf306165c426fe. Main: 1d2b90dffb8051dbd12d1edfa749ec2cedbd37ae. PR #27 targets main and contains only this task's retention/no-op/test preparation and redesign proposal. The published branch name remains cd/expire-completed-deliveries. The user requested implementation after publication; the same batch resolves retention overlap without a stacked PR or unrelated history.

### Caller ownership map

CodeGraph preflight was healthy. Exploration of mutateUser, sessionUser, dashboardForUser, bootstrapInstallation, drainInbox, projectGitHub, projectOpenSpec and merge paths identified these routes; targeted source searches confirmed their callers.

| Current path | New owner / disposition |
| --- | --- |
| access.ts identity/session lookup | User identity projection and existing session document |
| access.ts bindInstallation and server setup callbacks | Shared installation plus user-installation binding |
| access.ts seedLocalDemo | Seed shared domain fixtures, no aggregate or notifications |
| access.ts dashboardForUser | Authorized repository/PR/deployment reads; user preferences |
| events.ts verifyGitHubDelivery | Verified installation and repository access evidence |
| events.ts projectGitHub/applyGitHubEvent | Affected PR or deployment; installation/repository metadata only when changed |
| openspec.ts projectOpenSpec; events.ts projectPush | Proven PR-owned evidence |
| github.ts bootstrapInstallation, repair and reconciliation writers | Shared installation/resource refresh, independent run diagnostics |
| github.ts pagedGet/conditionalGet | Owner-scoped validators where sufficient data exists, otherwise complete unconditional pagination |
| server.ts merge authorization and merge.ts intents | Binding/repository/PR checks plus existing exact-head intent |
| server.ts knownOpenPullRequests, coordinators and refresh fan-out | Shared PR scheduling and currently authorized user bindings |
| events.ts notifyUser/notifyBoundUsers and callers; access.ts notification reads | Remove |
| configuration.tsx permission UI; snapshot-events.tsx popup effect | Remove notification behavior; preserve SSE invalidation effect |

Actual cross-document boundaries include installation connection plus binding, receipt completion after domain effects, and complete-list reconciliation across entities. A deployment may require correlation reads without a PR write. No evidence justifies a generic multi-document transaction framework.

### Reproducible local baseline

Run `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun scripts/domain-baseline.ts` with a disposable MongoDB 8 instance. The script creates and cleans a guarded UUID test database; fixtures are fictional DS9 data. At the baseline revision: 30 repositories, 570 PRs, one warm-up plus ten samples.

| Measurement | Result |
| --- | ---: |
| User BSON bytes | 266614 |
| Median authentication ms | 3.236 |
| Median snapshot assembly including DB reads ms | 3.794 |
| Median serialization ms | 0.494 |
| Snapshot response bytes | 339292 |
| Queue time before single receipt drain ms | 1 |
| Single receipt drain including verification ms | 20 |
| Receipt received-to-completion ms | 19 |

This measures loopback storage and application assembly, not production transport or browser rendering. The queue fixture is one immediately drained event, not a production-backlog reproduction. Millisecond timestamp rounding and final drain bookkeeping explain the receipt/drain difference. Production's seconds-long delay remains unproven by this local measurement.

## Implementation checkpoints

New domain-storage regressions established separate identity/binding storage and shared PR visibility. Three further tests in domain-conflicts.test.ts first failed on cosmetic timestamp rewrites, lost concurrent same-source-time review changes, and stale deployment rollback. Per-document revision compare-and-set, field patches, comparison before timestamp assignment, and existing deployment-ordering helpers corrected those failures.

`MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bunx vitest run test/domain-conflicts.test.ts test/domain-storage.test.ts`: 5/5 passed. This is focused evidence only, not completion of group 2 or validation of all existing callers. Callers must supply intended field changes rather than stale full-document copies.

A fourth conflict regression demonstrated repeated writes for an undefined optional field after BSON serialization. Comparing canonical BSON values corrected it; domain-conflicts.test.ts then passed 4/4.

The revised receipt TTL test first failed with expected 259200 versus actual 604800. After changing the index, `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bunx vitest run test/mongodb.test.ts -t 'inbox TTL'` passed with native deletion of 73-hour-old completed records and retention of 71-hour-old completed records, protected statuses and invalid timestamps. Processing-start timing and the full integration suite remain outstanding.

Subsequent combined check: `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bunx vitest run test/domain-storage.test.ts test/domain-conflicts.test.ts test/domain-events.test.ts test/mongodb.test.ts` passed 12/12. This includes observing the processing-start timestamp and retained payload while task fetching is blocked, then payload removal on completion. Task 2.4 is complete; the full existing regression suite remains outstanding.

The domain-conflicts suite now also verifies that oversized PR and deployment writes preserve the prior stored record (5/5 passed). Existing access tests were adapted to shared fixtures; retired notification, binding-seed and aggregate-CAS contracts were removed, with domain-CAS coverage retained separately. The adapted access suite passed 11/11, including hashed session/expiry, identity isolation, OpenSpec attention/order and safe links. A new shared-authorization suite passed revocation/suspension/removal but exposed disallowed-installation permission selection; that regression remains open until corrected and rerun.

### Interim new-model measurement (not final acceptance)

The adapted baseline runner with the same 30-repository / 570-PR fixture measured user BSON 117 bytes, median authentication 1.006 ms, snapshot assembly 7.508 ms, serialization 0.503 ms, snapshot 393000 bytes, single receipt drain 9 ms and receipt total 9 ms. This demonstrates smaller identity reads, but snapshot assembly and payload regressed at this checkpoint; it is not evidence that overall page latency is fixed. Repeat after the final API projection and validation. All measurements remain local loopback only.

The disallowed-installation selection was corrected. Combined storage/access/merge/authorization run at 16:47 passed 28/28 across five files (`access`, `merge`, `domain-storage`, `domain-conflicts`, `domain-authorization`). This verifies native shared storage, no-op and BSON bounds, session/OAuth and merge-intent security, plus snapshot revocation/suspension/removal and approved permission selection. Tasks 2.1 and 2.3 are complete. Detail/action route authorization and webhook/reconcile conflicts still need their own full-path evidence.

Focused reconciliation-run storage tests first failed for the missing module, then passed 2/2: unfinished records are visible while active, completion is single-use, summaries retain only bounded counts/outcome, reads use current approved bindings, and native TTL removes expired completed records without deleting unfinished runs. Integration into broad and targeted work remains required before task 2.5 can be complete.

Interim explain output showed indexed identity, binding, repository, PR and deployment reads. Examined documents equaled returned documents for this all-visible fixture (1, 1, 30, 570 and 90 respectively); measured server execution was 0–2 ms. The fixture does not yet prove filtering cost with a large hidden/closed population, and it does not explain production transport latency.

Frontend tests first failed on ignoring server preferences and missing save feedback; then a rename test failed on keeping the old repository name. The implemented frontend restores server preferences, serializes debounced edits, saves stable repository IDs (null means all), follows renames, drops revoked selections without widening them, preserves sort on Clear, and reports sanitized save failures. It updates the shared snapshot cache after saving and does not save defaults on mount. Popup delivery and the permission button are removed while authenticated SSE invalidation remains. Four focused frontend suites passed 37/37 at16:56, including configuration and existing dashboard behavior. Task6.2 is complete; backend preference and notification cleanup remain separate tasks.

Existing server fixtures now use separate repositories/PRs/bindings, including PR-owned evidence for startup task pushes. At17:03, 30/32 server tests passed; outstanding run-diagnostic and background-shutdown failures were retained rather than dropping assertions. Exact UTF-8 webhook signature and request-size tests passed 2/2 with shared PR reads. The original Playwright operator journey passed against the fixture server, including automatic refresh and a browser reload; a separate-session preference check is being added. None of these mocked provider checks constitutes the full empty-store reconciliation rehearsal.

Both Playwright journeys now pass: the existing inspect/merge/live-refresh path and saved repository/sort restoration after reload and in a separate browser context, with notification controls absent. These use the local fixture server, not production.

Two additional full-path regressions remain red: `domain-rebuild.test.ts` shows empty-store bootstrap never requests closed-PR pages and therefore misses a 2020 merged PR with unfinished obligations; `domain-live.test.ts` shows a title durably stored before an unrelated verification stall receives no SSE refresh until the entire drain completes. The latter isolates an application scheduling delay independently of Mongo query cost. Both must be fixed and rerun before their tasks are complete.

Runtime searches now find no notification producer/storage/snapshot/control references. Collection initialization and existing local-demo access/server tests pass with the new schema; tasks6.3 and6.4 are complete alongside the passing browser/UI evidence. Preferences API concurrency assertions now verify both saved fields and an independent PR write survive. A further boundary test is red because unknown nested sort/filter keys and unsupported filter stages are accepted; task6.1 remains incomplete until rejected with no write.

The clean-start runbook is delivered with named Railway service/environment and Atlas database identifiers, required fresh verification, writer/intake quiescence, exact artifact proof, reset/reconnect/reconciliation, gap recovery and roll-forward failure handling. It explicitly requires provider authorization and a passing isolated rehearsal before execution; no migration or mixed-schema operation is allowed. Task7.4 is complete as documentation, not as authorization or execution. README and curated architecture/decision notes now describe domain documents, saved preferences, deployment scope and notification removal.

The next focused checkpoint resolved the empty-store and delayed-SSE regressions: rebuild 1/1 and live 1/1 pass, alongside 18/18 focused domain tests. Server tests pass 32/32 without unhandled Mongo shutdown errors; deployment/event focused suites pass 12/12. Preferences API passes 3/3, including nested-key rejection, supported status validation and concurrent field updates. Tasks4.3 and6.1 are complete. Full reconciliation and the combined clean-start rehearsal still require validation.

The converted GitHub client suite currently passes26/39. Remaining failures include complete-list repository detachment, canonical OpenSpec projection, bodyless304 retry, deployment bootstrap correlation and direct reconciliation-run recording. These regression checks remain in place. Typecheck passes after fixture conversion; full validation is incomplete.

A further local query-plan probe adds 1000 closed PRs in an authorized repository and 1000 open PRs in an unauthorized repository after timing the unchanged baseline population. PR selection returns570 but examines1570 documents, exposing unnecessary closed-history reads. Identity/binding/repository/deployment reads examine exactly their returned1/1/30/90 documents. At this checkpoint the baseline measures user117bytes, auth0.840ms, snapshot7.150ms, serialization0.124ms, response339791bytes and receipt11ms. These are local measurements, and the query-plan issue remains open.

Adding the compound repository/retention-candidate index corrected the hidden-history probe: PR selection now examines570 documents for570 returned rows, with601 index keys. The baseline script asserts these counts. The repeated warm measurement is auth0.869ms, snapshot7.014ms, serialization0.117ms, response339791bytes, receipt11ms; repeat after remaining source changes before final acceptance.

The combined clean-start rehearsal passes in domain-rebuild.test.ts: a fresh guarded database is initialized, identity/binding helpers connect the fictional account, closed-PR pagination reconstructs a2020 unfinished obligation alongside an open PR, the preferences API saves stable selections, an app restart and another session restore them, and a signed HTTP webhook causes automatic SSE refresh and an updated snapshot. The receipt finishes and drops its payload. Provider responses are fictional and the identity helpers stand in for external OAuth; browser preference behavior is covered separately by Playwright. This is isolated pre-merge evidence, not a production reset or deployment.

The full suite checkpoint passes262/285 tests, with23 failures and one background-close error. Subsequent fixture corrections resolve the remaining GitHub client failure and seven of eight OpenSpec cases. Preserved projection-invariant tests reveal real stale-read conflicts: same-timestamp late repair can overwrite a new head/merge, and an old broad snapshot can resurrect completed/deleted work. These remain blocking correctness failures. No invariant assertions were discarded to obtain a passing suite.

The targeted and broad reconciliation paths now guard writes against the document revision/head captured before provider reads. All eight projection-invariant cases pass, including same-timestamp lifecycle changes and concurrent completion/deletion. Combined with the five domain-conflict cases, this completes task2.2. The OpenSpec suite remains7/8 while first-observation completion reporting is corrected; full validation and separate merged/default evidence remain outstanding.

An additional read-scope regression seeds100 PRs and100 deployments in one repository, then edits one title. It initially reads all100 PRs, demonstrating that the first refactor still reconstructed repository-wide state on every event. The test requires only the affected PR to be read and no deployment-history read for that edit. Event-specific owner selection is required before task7.1/7.3 acceptance; document separation alone is insufficient.

The scoped-read test now passes together with deployment ordering and domain-event tests (12/12). The receipt-recovery test also passes: a failed completion write leaves the successful PR effect and retry payload intact; the entrypoint's startup drain finishes it without manual reconciliation; replay after receipt absence leaves the PR byte-for-byte unchanged. Native TTL expiry is covered separately. Task4.2 is complete. A later full-suite checkpoint passes277 assertions but exits unsuccessfully on one asynchronous MongoDB-close error, which remains a validation blocker.

### Final local performance evidence

The baseline runner passes its exact query-plan assertions after scoped event selection and the retention index correction. The last run records:

| Measurement | Original | New |
| --- | ---: | ---: |
| User BSON bytes | 266614 | 117 |
| Median authentication ms | 3.236 | 2.437 |
| Median snapshot assembly ms | 3.794 | 13.841 |
| Median serialization ms | 0.494 | 0.189 |
| Snapshot bytes | 339292 | 339791 |
| Receipt received-to-completion ms | 19 | 16 |

Earlier new-model runs measured snapshot assembly around7ms and authentication around0.9ms; timings vary in this local environment. There is no demonstrated snapshot-assembly speedup. Additional database round trips and local workload remain relevant limits. The measured structural improvement is the small identity document and owner-scoped reads/writes, not a claim that production page load is now fast.

With1000 extra closed PRs and1000 unauthorized PRs, the actual PR query returns570 and examines570 documents (601 keys); identity/binding/repository/deployment queries examine1/1/30/90 documents respectively. The title-edit regression reads only its one PR and no deployment history. Conflict and replay tests verify unchanged records remain unchanged; the live test observes a refresh within250ms while unrelated work is blocked, and the combined rehearsal observes automatic signed-event refresh without a browser reload. Task7.3 is complete. Production transport, browser rendering and end-to-end latency remain post-merge measurements.

### Completed behavior coverage

The complete test run passes 279 tests across 40 files. Domain storage/conflict suites cover shared roots, bounded documents and compare-and-set updates; access/server/merge suites cover connection, scope, revocation and exact-head actions. Event, projection-invariant and receipt-recovery suites cover ordering, interrupted completion and replay. GitHub client and merged-evidence suites cover pagination, failed reads, unconditional retries, cold reconstruction and separate immutable/default evidence. Reconciliation-run tests cover scoped diagnostics and completed-only TTL. Preference API and frontend tests cover input rejection, stable selections, concurrent updates and restore behavior. The old twenty-deployment cap test now requires all 21 recent fixture deployments; the pre-merge-only merged-PR test exposed and fixed an incorrect obligation classification.

All test callers await asynchronous application shutdown before closing MongoDB. Newly added database suites run in the existing single-worker Mongo project, with a matching configuration contract test. No legacy aggregate writer, generic provider cache, installation reconciliation-evidence array, binding-seed script, or unused projectRepositoryTasks helper remains in runtime source. Existing security and projection-invariant assertions were retained while fixtures changed to independent documents.

Both Playwright journeys pass: inspect/merge/live refresh, and preference restoration in another browser session. A menu assertion now waits for rendered items instead of racing animation. Strict validation passes for both changes, the credential-URI scanner passes, and `git diff --check` passes.

The final `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun scripts/validate-all.ts` exits 0: checks, typecheck, frontend build, all 279 tests across 40 files, coverage and complexity scoring pass. Large routines were split along existing validation, projection and persistence responsibilities; no threshold was relaxed. Existing lint, bundle-size and Node localStorage warnings remain non-blocking. Local MongoDB is disposable and isolated; no production reads, reset, deployment, commit or push occurred.

Tasks 7.2 and 7.5 are complete. Group 8 requires a verified merge, reviewed runbook, exact artifact provenance and applicable production authorization. The clean-start rehearsal uses fictional provider fixtures and identity helpers; it does not claim live OAuth or production rollout acceptance.

Recommended publication message:

```text
add!(github)[rel]: split domain documents

Breaking: Rebuild application data from an empty database and reconnect accounts; legacy aggregate data and notification APIs are not supported.
```
