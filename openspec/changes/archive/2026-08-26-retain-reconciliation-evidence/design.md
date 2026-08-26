## Context

See `proposal.md` for motivation. An installation currently stores only `lastSuccessfulSyncAt` and `lastSyncError`; failure handling replaces the underlying cause with a generic message, while dashboard state consumes only the stale flag. User aggregates already support bounded same-lifecycle data with optimistic mutation retries.

## Goals / Non-Goals

**Goals:**

- Preserve enough per-installation history to identify the failed reconciliation operation after later attempts or restarts.
- Keep evidence user-scoped, bounded, and safe to persist in the application database.
- Preserve existing reconciliation, stale-state, and dashboard behavior.

**Non-Goals:**

- Changing GitHub App permissions, retry policy, reconciliation completeness, or provider configuration.
- Storing provider responses, request URLs, headers, credentials, stack traces, or a separate audit service.
- Adding a dashboard diagnostics screen or a public evidence API.

## Decisions

### Store a 20-record history on each installation aggregate

Add an optional reconciliation-evidence array to the existing installation record. Append one completion record for each successful or failed installation attempt, then retain its 20 most recent records. This keeps the evidence with the user-scoped projection and uses existing optimistic aggregate mutation rather than adding a collection or retention job.

Alternatives considered:

- A separate collection would support unbounded analytics, but adds a data lifecycle and query surface without an identified need.
- Extending provider cache would conflate HTTP cache entries with reconciliation outcomes and would not cover non-request failures.

### Persist classified, sanitized diagnostic facts

A record contains completion time, outcome, operation category, optional repository full name, optional HTTP status, and a short classified summary. The reconciliation boundary converts provider failures to this shape before persistence; raw response content, request URLs, headers, credentials, and stacks never enter the record. `lastSyncError` remains the stale-state marker and successful reconciliation continues to clear it.

Alternatives considered:

- Saving `Error.message` verbatim risks retaining sensitive URLs or provider content.
- Logging only retains no cross-restart evidence and cannot correlate later stale projections.

### Keep history private to the existing user aggregate

Do not alter the dashboard snapshot or add a public endpoint. Evidence is available only through the application's existing user-scoped persistence path for authorized operational diagnosis. This preserves the current generic UI treatment and avoids making provider details a browser data contract.

## Risks / Trade-offs

- [A useful failure lacks repository context] → Record repository identity only when the failing operation already knows it; retain the operation category for all failures.
- [The aggregate grows over time] → Hard-cap records at 20 and store only short classified fields.
- [Classification misses a new failure mode] → Use an `unknown` category with a safe summary, then add a specific category alongside a regression test when evidence warrants it.

## Migration Plan

1. Deploy the optional field without backfilling historical failures.
2. New reconciliation attempts append bounded evidence while preserving existing projection and stale semantics.
3. Roll back by deploying the prior version; existing optional evidence remains inert and can be ignored safely.
