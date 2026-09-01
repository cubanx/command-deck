## 1. Local canonicalization and review

- [x] 1.1 Update `test/quality-contract.test.ts` for the `command-deck` package/container/CI identity before implementation; verify the focused test passes.
- [x] 1.2 Update package, lockfile, CI container identity, scaffold, repository-derived fixtures, and stale `Command Center.ai` documentation titles; preserve protected Mongo identifiers and `Command Deck.ai` product text.
- [x] 1.3 Validate local canonicalization with focused quality/merge/server tests, typecheck, full disposable-Mongo tests, strict OpenSpec validation, `git diff --check`, and exact-name classification.
- [x] 1.4 Stop for human review before the first external authorization.

## 2. GitHub continuity

- [x] 2.1 Independently verify the user-reported `cubanx/command-deck` rename, default branch, and old-slug redirect; record current-state evidence.
- [x] 2.2 With authorization, update shared origin to `cubanx/command-deck` and verify GitHub App, webhook, and link continuity; restore the prior origin on failure.

## 3. Railway continuity

- [x] 3.1 Record 2026-09-01 read-only inventory: project `Command Deck.ai`, service `developer-command-center`, source `cubanx/dev-command-center` on `main`, domain `developer-command-center-production.up.railway.app`, and `PUBLIC_URL`/GitHub App variable-name presence.
- [x] 3.2 With authorization, relink Railway source to `cubanx/command-deck` and rename service/domain to `command-deck`; verify rollback to the prior source binding.
- [x] 3.3 With authorization, update `PUBLIC_URL` and GitHub App URL configuration, deploy the exact SHA, and verify readiness and webhook continuity.

## 4. Atlas continuity

- [x] 4.1 Inventory the target Atlas organization and classify project/cluster rename candidates while preserving `command-center-ai-production`, `command-center-ai-test-*`, Mongo users, and credentials.
- [x] 4.2 With authorization, rename the approved Atlas project to `command-deck`, retain the protected non-renamable cluster, and verify protected namespaces and rollback evidence.

## 5. 1Password metadata

- [x] 5.1 Inventory applicable 1Password metadata without reading secrets, rotating credentials, or creating projections.
- [x] 5.2 With authorization, update approved metadata only and verify unchanged secret references and destinations.

## 6. Codex and local continuity

- [ ] 6.1 Preserve existing worktree paths and verify saved-project and task continuity after the GitHub rename.
- [ ] 6.2 Use `command-deck` for future checkouts and worktrees after continuity evidence is recorded.

## 7. Final evidence and archive gate

- [ ] 7.1 Record final GitHub, Railway, Atlas, 1Password, and Codex evidence only after all authorized continuity and rollback checks pass.
- [ ] 7.2 Archive the change only after final evidence and review acceptance are complete.
