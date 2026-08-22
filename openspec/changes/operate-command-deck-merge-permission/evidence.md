# Merge permission evidence — task 2.1

Reviewed source snapshot: current `main` commit `2c17e9bf31c98f8db33decb5f6b43d0c761ab642`.

## Exact implementation

- [`src/server.ts:313`](../../../src/server.ts#L313) defines the installation-token GraphQL request. It sends `mutation MergePullRequest`, whose field is `mergePullRequest`, with `pullRequestId`, `expectedHeadOid`, and `mergeMethod` variables ([`src/server.ts:313-349`](../../../src/server.ts#L313-L349)).
- [`src/merge.ts:133-156`](../../../src/merge.ts#L133-L156) supplies `intent.headSha` as the expected head and uses `MERGE` as the merge method. [`test/merge.test.ts:162-180`](../../../test/merge.test.ts#L162-L180) and [`test/server.test.ts:493-608`](../../../test/server.test.ts#L493-L608) cover the exact-head and method handoff.
- A non-2xx provider result is normalized to `FORBIDDEN`; response and route details are sanitized to status only ([`src/server.ts:313-349`](../../../src/server.ts#L313-L349), [`src/merge.ts:97-107`](../../../src/merge.ts#L97-L107), [`test/merge.test.ts:368-392`](../../../test/merge.test.ts#L368-L392)).

## Current safe failure

Group 1's completed read-only installation check records that no Merge action is rendered before permission approval ([`tasks.md:7`](tasks.md#L7)). Therefore no mutation was attempted. This is UI-capability evidence, not a claimed live provider error.

## Permission documentation

- GitHub says Apps should test the GraphQL queries and mutations they intend to use when determining required permissions: [Choosing permissions for a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app#choosing-permissions-for-graphql-api-access).
- That same guidance scopes `Contents` to HTTP-based Git access: [Choosing permissions for Git access](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app#choosing-permissions-for-git-access).
- GitHub's REST reference places merging under Pull requests: [REST API endpoints for pull requests](https://docs.github.com/en/rest/pulls/pulls?apiVersion=2022-11-28).

## Minimum-permission proof — task 2.2

GitHub classifies merge operations under Pull requests, while `Contents` is for HTTP Git access. The reviewed implementation is an installation-token GraphQL mutation, so GitHub's required exact-mutation testing guidance applies. Command Deck currently offers only a safe read-only `409` preflight; it has no positive, no-merge dry run. The user accepted this documented Pull requests-only proof rather than an unsafe or deployment-unsupported dry run. The actual merge proof remains deferred to separately authorized Group 5.

## Permission update and rollback — tasks 2.3–2.4

Today, the GitHub App Command Deck.ai saved Pull requests access from Read-only to Read and write. Contents remained Read-only. GitHub displayed its success alert, and no installation account, repository selection, or other permission changed. Rollback is available on the same permissions page by setting Pull requests back to Read-only; it was not executed.

## Installation inventory — task 3.1

Current installations are `cubanx` (all repositories selected) and `Crisp-Inc` (all repositories selected). The canonical code allowlist also contains `hudson-law`, but it is not installed. The account-scoped contract permits `cubanx` and `Crisp-Inc` to use all repositories, while every other account remains selected-repository scoped.

## cubanx installation approval — partial task 3.2 evidence

The user approved `cubanx` all-repositories scope. GitHub saved that scope and confirmed the account update. The permission-review screen showed only Pull requests changing from Read-only to Read and write, and acceptance succeeded. The final saved UI shows all repositories with Pull requests Read and write; all other listed permission categories remain Read-only.

## Crisp-Inc installation approval — task 3.2 evidence

The user approved `Crisp-Inc` all-repositories scope. Its permission-review screen showed the sole delta Pull requests Read-only to Read and write, GitHub reported success, and the final saved UI retained all repositories with Pull requests Read and write. No other permission or repository selection changed. With both intended installed accounts approved, task 3.2 is complete.

## Task 3.3 validation attempt

`MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun run test -- test/access.test.ts test/pr-view.test.ts test/server.test.ts` completed with 21 of 52 tests passing, including `pr-view`; 31 DB-backed tests timed out at five seconds. This does not establish a code regression.

The same focused suite was rerun with local-network access against `MONGODB_URI_BASE=mongodb://127.0.0.1:27018` and passed 52 of 52 tests across access, pr-view, and server. The sandbox-only timeouts were environmental, not a code failure. Task 3.3 remains incomplete because live deployed/session-isolation prerequisites are unproven.

## Live task 3.3 verification attempt

Railway deployment `24796789-3106-4a3e-8bfa-9fb5b203e64e` is successful at commit `2c17e9bf31c98f8db33decb5f6b43d0c761ab642`. Required merge implementation `8878da91033e23ea4e5ff39eec3df2e0a7a95d1e` is its exact merge-base ancestor. Public `/ready` returned `{ok:true}`. The signed-in dashboard showed 26 authored PRs across `Crisp-Inc/yoda` and `Crisp-Inc/data-warehouse`; the Mergeable filter returned 0 of 26 and showed no Merge controls. No merge was clicked. Positive eligible-Merge and live two-user isolation remain unproven, so task 3.3 remains unchecked.

## Redaction boundary

This packet contains no tokens, raw payloads, or provider-response bodies.
