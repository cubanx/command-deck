## 1. Index inbox deliveries

- [x] 1.1 Add a regression using the real drain query and existing MongoDB harness; observe failure without an index-ordered plan.
- [x] 1.2 Add the received-time index through the initializer; verify the regression passes, retry index remains, and repeated initialization succeeds.

## 2. Validate repository changes

- [x] 2.1 Run focused MongoDB tests, repository validation, strict OpenSpec validation, and diff checks; record results and the separate production recovery proof gap.

All tasks are pre-merge repository work. Publication and deployment are outside this task; the parent owns actual webhook recovery and broader PR25 acceptance.

## Validation evidence

- Base: remote main verified at `4b34723ea849d81cb2fa5693df5f3785e3e920d0`; local branch `cd/index-inbox-deliveries`.
- Red: the new regression failed its index-ordered-plan assertion before the initializer change (1 failed, 2 passed).
- Green: focused `test/mongodb.test.ts`, `test/github-events.test.ts`, and `test/server-startup-reconciliation.test.ts`: 39/39 passed after building frontend assets.
- Repository manifest: `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun scripts/validate-all.ts` passed, including checks, typecheck, build, 269 tests in 29 files, and the complexity gate (244 functions, none above 30). Credential URI scan also passed. The credential-loading `validate:all` wrapper was deliberately not invoked because credential access is outside this task's authorization.
- `openspec validate index-inbox-deliveries --strict` and `git diff --check` passed. Task timing audit: all three tasks are pre-merge; no post-merge work is assigned here.
- Local MongoDB was 8.2.12 from the repository's `mongo:8` image. Its default descriptor limit caused `TooManyFilesOpen` and exit 133; the successful run used a disposable loopback container with `--ulimit nofile=64000:64000`. The container was removed afterward.
- Production evidence remains user-supplied MongoDB 8.0.32 query-plan proof only. Actual webhook drain, downstream projection, and startup reconciliation recovery have not been verified by this task. No production access or mutations occurred.
