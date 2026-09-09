## Why

The supplied hosted evidence identifies aggregate revision conflicts after PR 24 made failures observable. Local source inspection shows whole-user compare-and-swap writes retry three times immediately, while separate projection paths can write the same aggregate concurrently.

## What Changes

- Serialize calls through the existing aggregate mutation boundary per database instance and user inside one process, retaining database revision checks and existing bounded retries for external writers.
- Preserve independent-user concurrency, sanitized errors, callback replay semantics and queue release after failure.
- Test overlapping writers and newer-evidence preservation together with retention so fewer conflicts cannot conceal stale data loss.
- Keep provider reads outside the write queue; add no global reconciliation lock, dependency, retry increase, or provider mutation.

## Capabilities

### New Capabilities

- `aggregate-write-coordination`: Coordinate same-process user aggregate mutations without discarding independent updates or blocking unrelated users.

### Modified Capabilities

None.

## Impact

Primary implementation is `src/db.ts` and focused existing tests; inspect callbacks in events, GitHub, OpenSpec and identity paths for retry/freshness semantics. This is a candidate mitigation for demonstrated same-process contention, not proof of the exact production writer overlap or a distributed-lock guarantee.

The user requested a single PR with `retain-post-merge-work`, declaring both OpenSpecs. Proposal review precedes implementation; code review precedes publication. Formal PR 23/24 acceptance and blocked historical evidence publication stay with the controller.
