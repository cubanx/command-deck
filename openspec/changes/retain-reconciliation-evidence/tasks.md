## 1. Reconciliation evidence contract

- [x] 1.1 Add focused reconciliation tests first for sanitized failed and successful evidence, deterministic 20-record retention, stale-state clearing, and user isolation; verify the new cases fail before implementation with `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun run test -- test/github-client.test.ts test/server.test.ts`.

## 2. Bounded evidence persistence

- [x] 2.1 Extend the installation aggregate with the optional, bounded reconciliation-evidence shape and an append/prune helper; verify type coverage and retention tests pass with `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun run test -- test/github-client.test.ts`.
- [x] 2.2 Classify reconciliation failures at their existing shared boundary and append only safe completion evidence for both failure and success while preserving current projections and stale semantics; verify focused provider-client tests pass with `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun run test -- test/github-client.test.ts`.
- [x] 2.3 Preserve user-scoped evidence access while keeping the dashboard snapshot and public error treatment generic; verify route and isolation tests pass with `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun run test -- test/server.test.ts`.

## 3. Validation

- [ ] 3.1 Run `bun run typecheck`, `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun run test -- test/github-client.test.ts test/server.test.ts`, `openspec validate retain-reconciliation-evidence --strict`, and `git diff --check`; verify all commands succeed.
