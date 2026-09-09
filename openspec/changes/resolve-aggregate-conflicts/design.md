## Context

At baseline `acdffe49c0fd182c7dd671ad3c809fc972f80928`, `mutateUser` reads/clones a whole user document, applies a synchronous callback, increments revision, enforces the 12 MiB limit and replaces under a revision predicate. After three unsuccessful attempts it throws the locally classified aggregate-conflict error. Even a no-op callback attempts replacement.

The coordinator already serializes targeted requests per installation and excludes coordinated broad work. That does not serialize other installations for the same user, webhook projection, task projection or identity updates. `applyOpenPullRequest` guards newer timestamps/heads, then separately projects OpenSpec tasks. Broad snapshot replacement and callback-local result flags need scrutiny when writes overlap.

Recovered evidence remains at the original dirty `explain-reconciliation-errors/validation.md` packet and evidence-only commit `451255ebe44549634425e90285a8d2cebacf1c44` in the classification worktree. Its reported real-helper four-writer reproduction completed three writes and rejected one. The controller supplied 14 hosted `aggregate_conflict` receipts from September 9, 11:48:25–16:00:39 UTC (10 persistence and 4 targeted_provider); those logs were not queried afresh here. Distinct timestamps/stages do not establish duplicates or exact concurrent writers. The earlier connection-closure error is separate.

## Goals / Non-Goals

Prevent cooperating same-process aggregate writers from exhausting CAS solely by racing each other. Preserve cross-process conflict detection and existing evidence freshness. Do not claim all hosted failures solved, alter provider request scheduling/retries, add distributed locks, or complete old PR acceptance.

## Decisions

1. Place a small promise queue at `mutateUser`, keyed by database instance then user ID. Queue only the read/mutate/replace operation, not provider reads. Release the entry after completion or rejection, deleting only the current tail so an earlier completion cannot erase a successor. Reuse an existing helper if implementation inspection finds one.
2. Preserve the revision predicate, three bounded attempts, size guard, missing-user behavior, and rejection delivery to the caller. Recover the queue's sequencing tail explicitly without converting the caller's error into success. Another process or direct identity update can still conflict; fresh-read CAS retries remain necessary. No global lock or increased retry count.
3. Each attempt reads a fresh aggregate and reruns its synchronous mutation callback. Audit every callback for externally accumulated result flags and side effects: published results must describe a committed attempt, and notifications remain after persistence. Never invoke a nested same-user mutation inside the queue. Correct demonstrated violations only with failing tests.
4. Tests use controlled revision collisions rather than sleeps. Prove all four independent same-user writes survive, users proceed independently, a failed mutation does not poison its successor, external revision changes are retried without losing changes, and exhaustion remains visible. Include targeted/webhook/OpenSpec overlap and newer-head/merged-state protection with the retention tests.
5. Keep proposed scope bounded to write coordination and demonstrated adjacent replay/freshness defects. If reproductions identify an independent stale-snapshot bug requiring architectural changes, return that concrete finding for review before expanding implementation.

## Risks / Trade-offs

- Multiple processes and direct collection writers bypass the queue → retain CAS and test external revision changes; hosted conflicts may remain.
- Slow writes delay the same user → keep network/provider reads outside the queue and leave different users concurrent.
- Replayed callbacks or delayed stale snapshots can corrupt evidence even after successful CAS → audit callers and require committed-attempt/freshness tests, not merely a clean error count.
- Queue entries can leak or rejection can stall later work → deterministic success/failure cleanup tests.

## Migration Plan

No persisted schema change. Deliver with retention in the one requested PR after both proposal and code review. Verify the exact merged revision is deployed before observing natural conflict outcomes. Compare sanitized classifications and successful reconciliation evidence over a recorded finite window without failure injection. A clean sample is not proof of zero future conflicts. Rollback requires applicable authorization and assessment of the sibling retention data-loss risk.

## Task timing audit

Group 1 is user proposal review. All implementation, deterministic testing, combined validation and code review in Group 2 remain mandatory before merge. Group 3 alone requires exact merge/deployment provenance and carries `[post-merge]`; its unchecked tasks remain incomplete until their observations exist. Strict validation does not establish approval or hosted acceptance.
