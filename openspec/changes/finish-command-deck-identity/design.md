## Context

See proposal.md. `Command Deck.ai` is the human brand; `command-deck` is the canonical repository and infrastructure slug. The existing Mongo namespaces, identities, provider IDs, archived evidence, and worktree paths are stable boundaries.

## Goals / Non-Goals

**Goals:**

- Complete local canonicalization with tests first for package, container, and CI identity.
- Keep external operations in one durable, classification-first checklist with explicit authorization and rollback gates.

**Non-Goals:**

- Renaming `command-center-ai-production`, `command-center-ai-test-*`, Mongo users, credentials, provider IDs, archived evidence, or existing worktree paths.
- Performing an external mutation during local preparation.

## Decisions

- Use `command-deck` for repository-derived, package, container, scaffold, fixture, and CI identity; retain `Command Deck.ai` for human-facing product text.
- Treat the user-reported GitHub native rename as unverified until continuity checks capture live evidence.
- Keep Railway's current source, service, domain, public URL, and GitHub App configuration unchanged until separately authorized work verifies exact-SHA continuity and rollback.
- Restrict 1Password work to metadata-only classification; never read, rotate, or project secrets in this change without separate authorization.

## Risks / Trade-offs

- [Repository rename breaks integrations] → verify live canonical repository, default branch, redirects, App, webhooks, and links before acceptance; restore the prior binding on failure.
- [Railway loses deployment continuity] → capture the current source evidence, relink only with authorization, verify exact SHA/readiness/webhooks, and restore the prior source binding on failure.
- [Provider rename changes stable data identities] → inventory Atlas before action and preserve Mongo namespaces, users, and credentials.
- [Codex references become stale] → preserve existing paths and verify saved-project/task continuity before adopting `command-deck` for future checkouts.

## Migration Plan

1. Complete and review local canonicalization and exact-string classification.
2. Verify GitHub continuity against the live canonical repository; update shared origin only after evidence and authorization.
3. Execute the separately authorized Railway, Atlas, and 1Password metadata steps with their rollback checks.
4. Verify Codex/local continuity and use `command-deck` only for future checkouts/worktrees.
5. Archive only after final cross-system evidence is complete.

## Current GitHub Observation

On 2026-09-01, visible-browser evidence and authorized REST reads verified public `cubanx/command-deck`, default branch `main`, old-slug redirect, and canonical PR #21. Repository Settings lists active `Command Deck.ai` with the configured Railway webhook URL, secret, SSL verification, and a successful `workflow_run.in_progress` delivery at 11:30:38; an empty repository-webhook list is expected for the App webhook. Shared origin changed from `https://github.com/cubanx/dev-command-center.git` to `https://github.com/cubanx/command-deck.git`; remote HEAD and `main` resolve to `0b3e67cc044d25f2994d9072277a9c68ac9ca043`, and `origin/cd/finish-command-deck-identity` resolves to `c89cd372e106283359241ccdb2bbe36d2579870a`.

## Current Railway Observation

On 2026-09-01, controller task `01a01106-d295-7d42-93d7-525ce27a24bd` held the claim from opening `origin/main` `0b3e67cc044d25f2994d9072277a9c68ac9ca043` for project `b2fa6e37-274e-46e7-aef5-ef23bfd1b892`, production environment `a2aa23da-4455-49b4-8014-6866271aee54`, and service `180978ea-99f3-4e70-831a-6bc1d72612b3`. The rollback record retains pre-change `developer-command-center`, public `developer-command-center-production.up.railway.app`, private `developer-command-center.railway.internal`, old-domain `PUBLIC_URL` and GitHub App URLs, and deployment `66b928de-e6de-463f-bf23-62bd80911d8c` at `0b3e67c`; its source provider already named `cubanx/command-deck` despite Railway UI initially showing stale `Repo not found`.

Authorized visible-UI work renamed the service to `command-deck`, set public `https://command-deck.up.railway.app` and private `command-deck.railway.internal`, selected and relinked `cubanx/command-deck` with branch `main` refresh verification, and changed `PUBLIC_URL` plus GitHub App homepage, production callback, and webhook URLs to the new domain while retaining the local callback. Deployment `ef818c41-c6ec-4df9-bf5f-d4a5204ec879` became Active and Deployment successful; configuration source links prove exact SHA `0b3e67cc044d25f2994d9072277a9c68ac9ca043`. Read-only HTTP `/health` and `/ready` each returned 200 with `{"ok":true}`. Signed delivery `1e687900-a625-11f1-987e-5d22f882b712` (`deployment_status.created`, 12:49:38) showed GitHub success, and reopened `PUBLIC_URL` matched the exact new URL. Rollback was not needed; prior binding and settings remain recorded above. The controller claim was released after the complete Group 3 manifest and evidence audit passed.

## Current Atlas Observation

On 2026-09-01, read-only visible Chrome inventory found organization `Ricksy Business, Inc.` (`69b5c1ec6431583bee07288c`), which contains four unrelated projects and is not a rename candidate. Target project `command-center-ai` (`6a80e314c184ca88f1e6d525`) has one cluster and Project Settings exposes Edit for its project name. Its Free `command-center-ai` cluster runs MongoDB 8.0.30 on AWS `us-east-1` as a three-node, 512 MB replica set; its edit UI identifies the name but exposes no editable name control, so it is not an in-place rename candidate.

Visible databases are `admin`, `command-center-ai-production`, and `local`; preserve `command-center-ai-production` and the `command-center-ai-test-*` convention (no active test database was visible). Preserve users `command-center-ai-production-runtime` (`readWrite` on `command-center-ai-production`) and `dev-command-center-production-runtime` (`readWrite` on `dev-command-center-production`), including their roles and credentials. No provider mutation occurred.

Later on 2026-09-01, controller task `01a01106-d295-7d42-93d7-525ce27a24bd` claimed the batch from opening `origin/main` `be10fa472a932a9a390184e1d0e7a3233a501bfd` for this organization and project. Authorized Project Settings mutation renamed project `command-center-ai` to `command-deck`; post-reload UI retained immutable project ID `6a80e314c184ca88f1e6d525`. The protected audit found unchanged cluster `command-center-ai`, databases `admin`, `command-center-ai-production`, and `local`, and unchanged users and roles listed above; no active `command-center-ai-test-*` database was visible. Because cluster UI exposes no in-place name control, its name remains retained and no recreation was attempted, protecting database, endpoint, and credentials. Rollback would edit the project name back to `command-center-ai` on the same project ID; it was not needed. Full manifest audit passed and the controller claim was released.

## Current 1Password Metadata Observation

On 2026-09-01, authorized read-only Automation-vault inventory covered `2tpo4gq4itokluv53jrjzvtlny` (Ricksy · Atlas task-scoped administration), `zoevvjnwlb52itscyya6rjuaqi` (Command Deck.ai · GitHub OAuth secret), `df47vdml4poakcdftpavdtfina` (Command Deck.ai · Railway automation), `j53sxlduidts3cwzskaxbwrnnu` (Command Deck.ai · GitHub webhook signing), `ra62j7w2prsygnnkga44nm5b6m` (Ricksy · Atlas temporary IP access), `m5h6j7dj2mwxzwooks7ivjsh2m` (Command Deck.ai · GitHub App private key), and `wgoekoqmbztz4pwigv2cpyqq54` (Command Deck.ai · Atlas production runtime). During inventory, no secret value was read and no rotation, projection, or write occurred.

At inventory time, all items retained the stale `product/command-deck-ai` tag. Additional candidates are 2tpo purpose `dev-command-center`; zoe and m5 Railway `developer-command-center` destinations; df47 scope/purpose `developer-command-center` while destination `llm-elevated-production-railway:DEV_COMMAND_CENTER` is protected; j53 scope `developer-command-center`; ra62 project or `command-center-ai` tag and old Atlas-project scope; and wgo `command-center-ai` owner, scope, rotation-authority, and purpose metadata despite its Command Deck.ai production Railway destination. Preserve every item ID, secret field/reference, value, and actual destination binding. The wgo owner change is an ownership reassignment requiring explicit separate authorization and fail-closed review, not automatic cleanup; no broad tag normalization is authorized.

Later on 2026-09-01, an authorized Crisp human 1Password session updated metadata only on the seven inventoried Automation items. Each `product/command-deck-ai` tag became `product/command-deck`; ra62 became `project/command-deck` with scope `command-deck project IP access lists`; wgo owner tag and field became `command-deck`, with command-deck scope, rotation-authority, and purpose under explicit ownership-reassignment authorization. 2tpo purpose, zoe and m5 descriptive Railway destinations, df47 scope/purpose, and j53 scope changed only stale dev/developer-command-center wording to command-deck. Titles remained unchanged.

The literal binding `llm-elevated-production-railway:DEV_COMMAND_CENTER` remained exact. All item IDs, secret fields and values, immutable field references, credential material, projections, and actual destination bindings remained unchanged; no secret field was targeted or read. Final read-only manifest audit verified all seven titles, tags, and selected governance fields/references. The controller claim opened from `origin/main` `be10fa472a932a9a390184e1d0e7a3233a501bfd` and was released after audit.
