## 1. CI-blocking lint repair

- [x] 1.1 Replace the untyped access update and local-demo non-null assertion with behavior-preserving typed and guarded code, and format only the PR-owned `src/github.ts` and `test/server.test.ts`; verify `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun run test -- test/access.test.ts` and `bun run check` pass.

## 2. Validation

- [ ] 2.1 Run `bun run typecheck`, `openspec validate repair-ci-lint-baseline --strict`, and `git diff --check`; verify all commands succeed.
