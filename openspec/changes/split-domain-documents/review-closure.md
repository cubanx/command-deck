# PR #27 review closure

## Scope and provenance

Captured PR: https://github.com/cubanx/command-deck/pull/27. Reviewed and local HEAD: `0c03d6687e266d918bc5876724d0ec42f3f2e6e6`; base: `1d2b90dffb8051dbd12d1edfa749ec2cedbd37ae`. The worktree was clean at collection. The complete collector returned 15 unresolved, non-outdated threads and one changes-requested review, with no conversation comments. The user approved all seven behavior clusters individually, then requested implementation. Corrections are local and uncommitted; publication, thread resolution, and formal review clearance remain pending.

## Thread classification

| Cluster | Immutable thread ID | Disposition |
| --- | --- | --- |
| 1. Webhook correctness | `PRRT_kwDOTzXqhs6iFclm` | Actionable: correlate deployments by merge SHA as well as head SHA. |
| 1. Webhook correctness | `PRRT_kwDOTzXqhs6iFclq` | Actionable: interrupted effects must not lose the authorized refresh on retry. |
| 1. Webhook correctness | `PRRT_kwDOTzXqhs6iFcmI` | Add end-to-end webhook conflict coverage; general domain CAS coverage already exists. |
| 2. PR reconciliation | `PRRT_kwDOTzXqhs6iFclu` | Actionable: preserve terminal merged state against stale open responses. |
| 3. OpenSpec ownership | `PRRT_kwDOTzXqhs6iFclx` | Actionable: exact commit matches take precedence over branch fallback. |
| 4. Deployment volume | `PRRT_kwDOTzXqhs6iFcmO` | Actionable: bound discovery to recent deployments while continuing known unfinished deployments. |
| 5. Storage diagnostics | `PRRT_kwDOTzXqhs6iFcl2` | Partially actionable: add size-error diagnostic classification coverage. Existing domain-conflicts tests already cover oversized-write rejection and CAS, contrary to the broader claim. |
| 5. Storage diagnostics | `PRRT_kwDOTzXqhs6iFcl5` | Actionable: align native TTL polling and test deadlines with the established monitor allowance. |
| 5. Storage diagnostics | `PRRT_kwDOTzXqhs6iFcmL` | Actionable: describe running and completed run documents accurately. |
| 6. Preferences | `PRRT_kwDOTzXqhs6iFcmA` | Actionable: consume persisted preferences from the server response. |
| 6. Preferences | `PRRT_kwDOTzXqhs6iFcmE` | Partially actionable: stub requests in the older UI test. Dedicated preference API/UI and browser persistence tests already exist. |
| 7. Documentation | `PRRT_kwDOTzXqhs6iFcl8` | Actionable: remove the deleted binding-seed command and describe verified reconnect. |
| 7. Documentation | `PRRT_kwDOTzXqhs6iFcmU` | Actionable: update historical decision notes without claiming production completion. |
| Baseline fixture | `PRRT_kwDOTzXqhs6iFcmR` | Non-actionable as a defect: direct fixture insertion deliberately isolates drain timing; both accepted statuses are supported. No demonstrated current failure. |
| Validation evidence | `PRRT_kwDOTzXqhs6iFcmX` | Non-actionable: the captured validation log reports 279 passing tests across 40 files, and the test file count including .tsx is 40. The review omitted .tsx files. |

No thread was already resolved. Non-actionable classifications are not GitHub replies or resolutions. Local findings on stale write revisions, merge-evidence failures, archived source links, and reconciliation overlap belong to the selected clusters and are included in their correctness sweep.

## Validation and independent review

The seven clusters are implemented locally. The regression sweep also covers a webhook racing another PR update, bootstrap revision guards surviving a CAS retry, broad reconciliation reserving its slot before awaited bookkeeping, and preserving archived OpenSpec source paths.

One independent Sol Medium reviewer inspected the fixed clusters against the captured HEAD and base. The reviewed diff SHA-256 was `01a7abba556c247b65c27b8091e3bba5890f86e549d495590ebbcd9433638ed8`. Its three actionable findings were reproduced before fixing: incomplete immutable merge evidence could permit PR deletion; an unrelated OpenSpec's source commit could interfere with ownership; and bootstrap upserts could reopen terminal merged state. Focused regressions then passed (30 tests across six files). Final changes were checked by targeted tests and root inspection, without a second independent review.

Deployment discovery persists and fetches statuses only for the latest 48 hours plus known unfinished deployments. REST list pagination remains exhaustive because the endpoint exposes no time filter or explicit ordering contract; no unsafe early cutoff or 20-row cap is introduced. The independent reviewer classified this remaining list overhead as a limitation, not an unresolved finding.

Validation uses a disposable localhost MongoDB container with `--ulimit nofile=65536:65536`; the default limit caused Mongo itself to crash during larger runs. Aborted/time-out runs are not acceptance evidence. The historical 279-test result describes the original implementation, not these corrections. No production or performance acceptance is claimed.

Final validation on 2026-09-14:

- `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun scripts/validate-all.ts`: passed the complete repository manifest (Biome, typecheck, web build, coverage tests, complexity gate). All 289 tests passed across 40 files; 255 functions checked with zero above CRAP 30. Existing nonblocking lint and bundle-size warnings remain. Log: `/tmp/cd-review-final.log`.
- `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bunx playwright test`: both browser journeys passed, including preference restoration in another session. Log: `/tmp/cd-closure-browser.log`.
- `openspec validate split-domain-documents --strict` and `openspec validate expire-completed-deliveries --strict`: passed.
- `bun scripts/scan-credential-uris.ts` and `git diff --check`: passed.
- Final runtime/test diff SHA-256 (`git diff --binary -- src test`): `c4c3d0d2dd325d8588c4736c1500500280daaeee0986c7befada9e5897c0d527`.

At validation completion, the fixes were uncommitted and unpublished. The subsequent commit-and-continue invocation authorizes their commit and normal push to PR #27. GitHub thread resolution and formal review clearance remain separate pending work. Group 8 cannot start until merge, exact artifact provenance, and the applicable production authorization are established.
