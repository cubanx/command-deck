## 1. Regression Contracts

- [x] 1.1 Add failing push-projection tests for proven final-tree absence, explicit removal, ambiguous `404`, and non-`404` GitHub failure; verify the focused Bun test fails before implementation
- [x] 1.2 Add failing reconciliation tests for retry recovery, one contextual terminal error per failed installation, continued serial processing, and sanitized diagnostics; verify the focused Bun test fails before implementation
- [x] 1.3 Add a failing dashboard test proving a `401` snapshot load makes one request, renders signed-out state, and emits no application error while other failures remain sanitized; verify the focused Bun test fails before implementation

## 2. Minimal Root-Cause Changes

- [x] 2.1 Verify final-SHA task absence through a complete Git tree only after content `404`, preserve prior evidence without deletion, and keep ambiguous failures on durable retry; verify the focused push-projection tests pass
- [x] 2.2 Preserve existing structured GitHub failure context through reconciliation and remove duplicate terminal logging without changing bounded provider retries; verify the focused reconciliation tests pass
- [x] 2.3 Treat only snapshot `401` as the existing signed-out client state without retry or error logging; verify the focused dashboard tests pass

## 3. Validation and Operational Gates

- [x] 3.1 Run all focused runtime-classification tests, `bun run typecheck`, `openspec validate classify-runtime-errors --strict`, and `git diff --check`; verify every command passes
- [x] 3.2 Run `bun test`; verify the full suite passes without production credentials, provider writes, deployment, or external-system mutation
