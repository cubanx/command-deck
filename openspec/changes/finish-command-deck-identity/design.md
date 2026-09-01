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
