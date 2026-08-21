## 1. Complete failure persistence safely

- [x] 1.1 Add focused regression tests for failed manual repair and OAuth bootstrap evidence, stale state, and sanitized logs; verify they fail before implementation with `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun run test -- test/server.test.ts test/github-client.test.ts`.
- [x] 1.2 Centralize sanitized failure persistence for every current bootstrap entry point and replace raw error logging with safe classification; verify the focused tests pass with `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun run test -- test/server.test.ts test/github-client.test.ts`.

## 2. Validation

- [x] 2.1 Run `bun run typecheck`, `bun run check`, `openspec validate close-reconciliation-review-findings --strict`, and `git diff --check`; verify all commands succeed.
