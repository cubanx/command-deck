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
