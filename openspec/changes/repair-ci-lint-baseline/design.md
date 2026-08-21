## Context

See proposal.md. `bun run check` runs Biome and fails on an untyped MongoDB update object and a non-null assertion in `src/access.ts`, plus formatting introduced in the reconciliation-evidence PR files.

## Goals / Non-Goals

**Goals:**

- Make the existing access code pass Biome's two fatal rules without changing its behavior.
- Keep the PR's CI signal usable.

**Non-Goals:**

- Broad `any` cleanup, lint-policy changes, or CI configuration changes.

## Decisions

- Use MongoDB's `UpdateFilter<UserAggregate>` for the existing update payload instead of `any`; it verifies the unchanged operators against the aggregate shape.
- Replace the local-demo assertion with an explicit invariant error after `bindInstallation`; a missing installation remains a visible failure instead of becoming an unsafe dereference.
- Run Biome formatting only on the two PR-owned files with fatal format diagnostics; do not mechanically reformat the repository.
- Extend the existing focused access tests rather than adding a new test harness.

## Risks / Trade-offs

- [The local-demo invariant could surface a setup regression] → Throw a clear error and retain the existing deterministic seed test.
