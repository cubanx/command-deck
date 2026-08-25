## 1. Intake Regression

- [x] 1.1 Add a regression test for a valid signed delivery with `installation.id`, no `installation.account`, and one approved existing binding; verify it fails because no inbox row is persisted before the implementation change.
- [x] 1.2 Add negative coverage for an installation ID without exactly one approved binding; verify the delivery remains unpersisted.

## 2. Shared Intake Fix

- [x] 2.1 Resolve a missing payload account through exactly one approved installation binding in the shared intake path while preserving included-account and downstream consistency checks; verify the focused intake tests pass.
- [x] 2.2 Run the focused GitHub-event suite, `bun test`, `bun run typecheck`, `openspec validate repair-webhook-installation-identity --strict`, and `git diff --check`; verify focused and static validation pass and the full suite matches the clean-HEAD baseline of two unrelated server-test failures.

## 3. Shared-Account Fan-Out

- [x] 3.1 Add a regression with two users bound to the same installation and approved account; verify the missing-account delivery fails before the implementation update.
- [x] 3.2 Resolve binding cardinality by normalized approved account identity, preserve projection fan-out to both users, and verify focused tests, typecheck, strict OpenSpec validation, and `git diff --check` pass.
