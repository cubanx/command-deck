# Group 2 validation

## Caller audit

Baseline: PR #25 proposal commit `94434e108c032f8705905172c1ed6353ad22fe73`. Audited all runtime `mutateUser` call sites in `access.ts`, `events.ts`, `github.ts`, and `openspec.ts`, plus direct `users` writes.

- Identity binding, seed binding, and local demo callbacks mutate their supplied clone synchronously. The demo intentionally replaces fixture data. No callback invokes a nested same-user mutation or provider read.
- `upsertIdentity` uses an atomic field update and increments revision outside the queue. New-user seeding inserts only when absent. CAS remains necessary for these writers and other processes.
- Event projection computes notification and invalidation flags inside a retryable callback; these must describe only the committed attempt. Notifications execute after persistence.
- Targeted PR apply/removal now reset per-user result flags on each attempt. Two real MongoDB regressions failed with spurious changed results before the fix and pass afterward. Observed-record checks are reevaluated against the fresh clone; merged state cannot be undone by delayed open or unmerged-close reads. Marking lifecycle stale and recording sanitized failures have no external callback side effects.
- Broad bootstrap resets its per-user counts on every attempt and reevaluates PR snapshot merges against current state. Its source snapshots precede persistence, so the queue alone cannot establish lifecycle freshness; retention overlap tests remain required.
- OpenSpec update/deletion accumulated flags across attempts and users. Two deterministic tests demonstrated that a losing completion/deletion attempt could report a transition already committed by another writer. Results now reset per attempt and are combined across users only after successful writes.

## Tests first

- `bunx vitest run test/aggregate-write.test.ts` before the queue: 4 passed, 1 failed. Four overlapping real-helper writes produced three fulfilled results and one rejected result. No sleeps or production data were used.
- The same five tests pass after coordination. Coverage includes independent user/database progress, callback/persistence failure release, external revision preservation, unchanged three-attempt exhaustion, missing-user and size-limit guards.
- `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bunx vitest run test/openspec.test.ts -t 'OpenSpec retry'` before the accounting fix: both cases failed, reporting changes from discarded attempts. Both pass after the fix.
- The real MongoDB webhook regression `discarded webhook CAS attempts do not emit mergeability notifications` failed with one spurious notification before the fix and passes afterward. Per-user notification/invalidation flags and reconciliation targets are now collected from the final attempt and published only after its successful write.
- Combined focused aggregate/OpenSpec/access validation: 28 tests passed across three files against task-owned disposable MongoDB. Sandbox loopback attempts timed out; successful runs used task-scoped elevation.

- `test/projection-invariants.test.ts` reproduces real webhook/task projection overlap during an in-flight targeted read. Both late OPEN and CLOSED responses initially regressed committed merged state. After lifecycle guards, an old task payload still overwrote newer task evidence. The strengthened cases pass after task projection was moved into the same guarded mutation through extracted existing `projectRepositoryTasks` logic; no separate unguarded targeted task write remains.
- Manual repair tests cover known open and retained merged candidates, missing-number recovery within an authorized repository, and rejection of unbound repository/installation or invalid numbers. Scheduled weekday repair includes known retained work and excludes unrelated closed history. These pass against local disposable MongoDB.

## Final local evidence

Targeted and broad overlap regressions are complete: eight projection-invariant tests pass, including newer heads, real merged webhooks, three-slug progress across same-author aggregates, late completion and no resurrection after newer completion. The five-file root validation set passed 62 tests before adding the final two delayed merged-evidence cases. Two further broad-read tests reproduced duplicate retained cards and resurrection after concurrent completion. Broad repair now preserves a repository that changed during provider reads, including absence, and projects stable task evidence inside the same write. This conservative repository-level guard may defer busy repositories to their next refresh; it avoids another lock or writer path. Final `validate:all` passed after behavior-preserving helper extractions to meet the existing complexity gate: 267 tests across 29 files passed; 244 functions checked, zero above the CRAP limit of 30. Credential scanning, lint, typecheck, and frontend build passed. Log: `/private/tmp/cd-pr25-validation-final.log`. The user subsequently invoked `commit-and-continue` after the review handoff; publication is authorized and task 2.4 is complete. A preliminary `validate:all` confirmed Local Automation secret injection works outside the sandbox and caught an assignment-expression lint error in the queue, which was corrected. No provider mutation or production failure injection occurred.
