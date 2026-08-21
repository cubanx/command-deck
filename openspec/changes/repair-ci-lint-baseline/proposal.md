## Why

PR #16 cannot become review-ready because the repository check command fails on two existing Biome errors in the access aggregate code. The repair is behavior-preserving and removes the lint blockers without broad cleanup.

## What Changes

- Replace the untyped MongoDB update object with the collection's typed update shape.
- Replace the local-demo non-null assertion with an explicit invariant guard.
- Format the reconciliation-evidence files that this PR left nonconformant.
- Verify the existing focused avatar-upsert and local-demo coverage, then verify the repository check command.

## Capabilities

No specification change. This is a behavior-preserving lint repair, so `skip_specs: true` is set.

## Impact

- Affected code: `src/access.ts`, `src/github.ts`, `test/server.test.ts`, and focused access tests.
- No API, database schema, dependency, provider, or production configuration changes.
