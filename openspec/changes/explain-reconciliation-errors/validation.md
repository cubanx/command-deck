# Validation evidence

## Proposal and task timing audit

Audited separately from strict OpenSpec validation before implementation:

| Tasks | Timing | Dependency and marker audit |
| --- | --- | --- |
| 1.1–1.4 | Pre-review | Repository tests, implementation, and validation; no merge dependency and no post-merge marker. |
| None | Post-review pre-merge | No work has been deferred to this interval. Review findings remain required before merge if later discovered. |
| 2.1–2.2 | Merge-dependent | Group heading contains literal `[post-merge]`; explicit prerequisites require merge, separately authorized deployment, and exact deployed provenance. |

No mixed groups or missing/ambiguous markers found. All task checkboxes remain incomplete until evidence is recorded; markers do not establish completion or grant provider authorization.

Implementation baseline: refreshed `origin/main` = HEAD = `b57bb94d91a0c1fc0a4073a9101f58cd7df44261`. No branch or PR had been published at that checkpoint. Historical provider evidence is controller-supplied and has not been independently refreshed.

## Repository checks

- Proposal-only `openspec validate explain-reconciliation-errors --strict`: passed before implementation; revalidated after documenting Railway's field mapping.
- `bun install --frozen-lockfile`: passed with 149 packages installed; sandbox tempdir write required the normal elevated retry. Manifest and lockfile unchanged.
- `bun run build:web`: passed; existing large-chunk advisory remains.
- Disposable MongoDB 8 started only on `127.0.0.1:27018`; readiness ping returned `1`. No production credentials used.
- Dockerfile pins Bun `1.3.11`; local Bun is `1.3.14`. Pinned image `sha256:0733e50325078969732ebe3b15ce4c4be5082f18c4ac1a0f0ca4839c2e4e42a7` is locally available for independent transport verification.

## Implementation and final results

- Tests first: builder recorded `bunx vitest run test/reconciliation-coordinator.test.ts` failing two new regressions before runtime edits (missing ownership context and subprocess contract). The corrected coordinator suite passes 9/9.
- Root inspection found draft stage attribution mutated arbitrary thrown values and conflated bootstrap with credentials. Added regressions independently reproduced wrong `pull_request` attribution for frozen/primitive failures and wrong `installation_credentials` attribution for a bootstrap exception, then corrected both.
- Added asynchronous projection-persistence failure coverage through the real targeted provider path; the existing stage reporter now observes the rejection because persistence is awaited inside its catch boundary.
- Full final suite: `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun run test` passed **232/232 tests, 28/28 files**, 50.63 seconds. Log: `/tmp/cd-explain-full-2.log` (ephemeral local evidence).
- `bun run typecheck`: passed after final runtime/test changes.
- `bunx biome check` over all eight owned runtime/test files: passed with 89 warnings and 3 informational diagnostics, no errors. Existing broad `any`/lint debt is not part of this fix.
- `git diff --check`: passed.
- `openspec validate explain-reconciliation-errors --strict`: passed before implementation and after implementation.

The first integration attempts were invalidated by disposable MongoDB exiting with code 133. Captured container logs identified `TooManyFilesOpen` while creating an eventfd. Recreated only this task's test container with `--ulimit nofile=65536:65536`, preserving loopback binding; the subsequent full suite passed. No repository runtime setting or provider was changed. Crash evidence: `/tmp/cd-explain-mongo-crash.log` (ephemeral local evidence).

Cleanup completed: stopped the task-owned disposable MongoDB container after validation; its `--rm` lifecycle removes the container and anonymous test volumes.

### Runtime transport proof

`test/fixtures/reconciliation-stderr.ts` exercises real coordinator failure boundaries, successful recovery, run bookkeeping, credential failure, provider HTTP failure, and internally identified already-reported aggregate suppression. Its subprocess test captures actual stderr rather than replacing `console.error`.

Independently executed the same fixture with `oven/bun:1.3.11`, the Dockerfile-pinned runtime, using `--network none --read-only` and a read-only repository mount. Exit 0; stdout empty; exactly five parseable JSON lines with operations `pull_request`, `reconciliation`, `reconciliation_audit`, `installation_credentials`, and `installation_identity`. The provider line retains status 401. Every line includes `level: error`, an actionable `message`, installation identity (explicitly `unknown` for broad discovery), operation, and category. No injected name/message/body canaries appear. Ephemeral captures: `/tmp/cd-explain-bun1311.stdout` and `/tmp/cd-explain-bun1311.stderr`.

Final timing audit: Group 1 remains pre-review and is complete; Group 2 remains explicitly `[post-merge]`, incomplete, and dependent on merged/deployed provenance plus fresh natural logs. No task was reclassified merely to permit completion.

Publication subject: `fix?(github)[rel]: explain reconciliation errors`. This corrects an existing reliability expectation and changes externally visible log output; grammar and compliance details checked against [Standard Commits](https://github.com/standard-commits/standard-commits). The subsequent user invocation of `commit-and-continue` authorizes committing and pushing the completed repository group.

## Publication validation

Isolated branch: `cd/explain-reconciliation-errors`, targeting the same branch on `origin`. The refreshed baseline had no outgoing commits or unrelated changes.

Required `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun run validate:all` passed using the established secret-injection entrypoint and disposable loopback MongoDB with the verified file-limit setting. Credential scans, lint, typecheck, frontend build, and coverage/complexity gates passed: **232 tests, 28 files; 229 functions checked, none above CRAP 30**. Ephemeral log: `/tmp/cd-explain-prepush.log`.

## Hosted acceptance

Pending Group 2 prerequisites and fresh natural evidence. Local subprocess stderr tests cannot establish Railway ingestion, deployed SHA, or production success.

## PR 23 review corrections

The independent exact-head review of `6ec8ec0fed13a3e11031849451a3694b0c63c450` found two sibling-path gaps: OAuth bootstrap still supplied a raw provider reporter before its aggregate logger, and manual installation repair did not log resolved error results. Both P1 findings were submitted through the canonical review bot on that head.

Focused regressions reproduced both gaps before the fixes. OAuth bootstrap now uses only its structured aggregate owner; manual repair logs resolved failures once and distinguishes persistence failures as bookkeeping. A further status assertion failed because the bootstrap task fetcher discarded HTTP status; retaining that numeric status on its locally authored error restores it without retaining provider content. The regression now proves one sanitized JSON diagnostic with status 500. Separate tests cover persistence failures after both returned and thrown provider errors while preserving response semantics.

The historical review remains bound to its original head; fixing and publishing the code does not itself clear the review or establish a newer-head independent review. Group 2 remains incomplete.

Final review-fix validation: required `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun run validate:all` passed with **236/236 tests, 28/28 files; 229 functions checked, none above CRAP 30**, including credential scans, lint, typecheck and frontend build. Strict OpenSpec validation and `git diff --check` passed. The initial check caught formatting; a later test run caught the older broad-reconciliation assertion omitting the now-preserved HTTP 500 status. Both were corrected before the final successful run. Ephemeral log: `/tmp/cd-pr23-fixes-validation.log`.
