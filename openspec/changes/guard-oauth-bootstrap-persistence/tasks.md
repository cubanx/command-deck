## 1. Guard detached persistence

- [x] 1.1 Add a regression test that forces OAuth bootstrap persistence to reject and verifies no unhandled rejection plus safe logs; verify it fails before implementation with `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun run test -- test/server.test.ts`.
- [x] 1.2 Catch detached OAuth persistence failures, retain safe bootstrap logging, and log only fixed persistence classification; verify the focused test passes with `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun run test -- test/server.test.ts`.

## 2. Validation

- [x] 2.1 Run `bun run typecheck`, `bun run check`, `openspec validate guard-oauth-bootstrap-persistence --strict`, and `git diff --check`; verify all commands succeed.
