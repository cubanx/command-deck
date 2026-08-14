## Context

PR #5 is merged on `main` at `aeebad98c560dcb3b2d998837f4141b90a36ea5b`, satisfying the implementation prerequisite. The dashboard is a server-rendered shell with a small browser script. Local checkout evidence currently exists only in page memory, is replaced on every directory selection, and matches PR branches without repository identity. Scheduled reconciliation already routes through one installation bootstrap helper. GitHub sessions intentionally retain only a hashed application session and user identity, never a provider token.

Deployment bootstrap currently takes the first record from a one-record statuses response without retaining enough provider ordering identity to adjudicate later events. Webhook projection compares timestamps and protects terminal state only from `pending`, leaving equal-time or later-delivered `in_progress` ordering insufficiently defined. A focused failing fixture must prove the stale `in_progress` sequence before production code changes; no cosmetic state mapping is permitted.

Current GitHub App installations are read-only. GitHub documents `mergePullRequest` with `expectedHeadOid` and `mergeMethod`, while GraphQL App permission requirements must be proven in operation. Current repository settings allow merge commits, squash, and rebase, and every merged code PR on `main` uses a two-parent merge commit, so `MERGE` is the established method.

## Goals / Non-Goals

**Goals:**

- Keep the browser implementation platform-native, browser-local, repository-scoped, and dependency-free.
- Share existing projection, reconciliation, authentication, and OpenSpec policy paths rather than creating parallel engines.
- Make every checkout, reconciliation, appearance, deployment, and merge failure explicit and accessible.
- Fail closed at identity, installation binding, repository authorization, exact head, provider permission, branch policy, and OpenSpec gates.

**Non-Goals:**

- Persisting any checkout or appearance data on the server.
- Broadening notification triggers, GitHub OAuth token persistence, installation accounts, or App permissions in PR #8.
- Provider configuration, permission approval, deployment, production verification, or a real merge.
- Supporting browsers that cannot persist File System Access handles; committed projections remain the fallback.

## Decisions

### Use native disclosure and one hash-addressed configuration section

Render OpenSpec evidence with collapsed `<details>` and `<summary>` elements. Replace both top actions with links to the same `#configuration` section, preserving browser history, focus, and no-framework operation. The dashboard section keeps a non-visual accessible name through the existing ARIA or visually-hidden convention.

Alternatives rejected: a custom accordion/state component duplicates native accessibility; separate checkout, notification, and appearance views fragment a small application; a modal traps a configuration surface that should be linkable.

### Persist directory handles in IndexedDB and scalar appearance in localStorage

IndexedDB is the smallest native store that can structured-clone `FileSystemDirectoryHandle` objects. Store organization-root and exact repository-override handles keyed by GitHub installation account plus stable repository ID. On load, call `queryPermission`; request permission only from a developer action. Resolve a known repository only through its exact directory name and verify its remote repository identity before reading `.git/HEAD` and OpenSpec tasks. Never guess or upload local values.

Appearance is a scalar enum, so localStorage is sufficient. System mode listens to `prefers-color-scheme`; explicit modes set a root data attribute and `color-scheme`. No theme library.

Alternatives rejected: localStorage cannot store directory handles; server storage violates the local-data boundary; filename or branch-only matching is ambiguous.

### Reuse installation bootstrap behind one shared reconciliation lock

Extract only the user-bound approved-installation selection needed by the manual route, then call the existing installation bootstrap/token flow. A single in-flight promise guards both the six-hour scheduler and `POST /api/reconcile`; overlapping manual requests return a running response and the scheduler does not start duplicate work. Success refreshes the current snapshot; failures are categorized and sanitized.

Alternative rejected: a second reconciliation implementation would drift from scheduled recovery and weaken account scoping.

### Prove and fix deployment ordering in the shared projection

First add a failing regression fixture matching the stale `in_progress` sequence across bootstrap and webhook delivery. Retain provider deployment-status identity and creation time, compare both deterministically, and apply one shared newest-status rule in bootstrap and event projection. A terminal projection cannot be replaced by an older or equal-order non-terminal update. Dashboard rendering remains a direct projection with no relabeling.

If the fixture cannot prove the reported incorrect state from repository evidence, stop this group rather than inventing a state rule; live production inspection remains outside this task's authorization.

### Require action-time user reauthorization before installation authority

Starting Merge creates a short-lived, single-use OAuth intent bound to the hashed session user, installation, stable repository ID, PR number, and projected head SHA. The callback keeps the exchanged user token request-local, verifies the returned GitHub identity equals the session identity, and calls the least-privilege repository-role endpoint. If the current OAuth/App permission envelope cannot prove role without an unapproved scope expansion, fail closed.

Only after role proof does the server obtain an installation token, verify approved account/user/repository binding, re-fetch authoritative PR, repository merge settings, protections/rulesets, checks, reviews, and OpenSpec completion, and return confirmation data. Confirmation submits the one-time intent; the server repeats mutable gates and calls GraphQL `mergePullRequest` with `mergeMethod: MERGE` and the exact `expectedHeadOid`. Provider errors map to sanitized categories and trigger an immediate snapshot refresh.

Alternatives rejected: cached session identity is not current authorization; installation-only role checks use installation authority too early; a persisted user token broadens breach impact; a broad personal token violates the installation model.

### Ship the Merge control disabled until operational approval

The UI detects the installation permission projection and explains why Merge is unavailable under read-only permissions. Code paths and tests land in PR #8, but the separate operational change owns permission proof and rollout. The implementation targets Pull requests write and does not request Contents write; the operational gate must prove the GraphQL permission before any change.

## Risks / Trade-offs

- [Directory-handle persistence differs across browsers] → Feature-detect IndexedDB/File System Access, expose permission states, and retain committed projections.
- [Repository directory names are not unique outside an account root] → Key by account plus stable GitHub repository ID and verify the local remote identity.
- [Scheduled and manual reconciliation can contend] → Share one in-flight guard and return explicit running state.
- [Deployment provider ordering is under-specified] → Preserve status ID and creation time, prove the failing sequence, and stop if evidence is insufficient.
- [Action-time OAuth adds a redirect] → Bind a short-lived intent and return to the exact PR card; accept the redirect to avoid stored user authority.
- [GraphQL App permission mapping is not fully documented] → Keep the control disabled and require the operational proof before requesting permission.
- [Repository merge policy changes] → Re-fetch allowed methods and fail closed if `MERGE` is unavailable.

## Migration Plan

1. Land PR #8 with browser-local storage migration from no saved configuration, the Merge control disabled under existing permissions, and focused tests.
2. Deploy through the existing separately authorized production workflow; no provider mutation is part of this change.
3. Execute `operate-command-deck-merge-permission` only after the exact PR #8 merge SHA is verified on current `main` and deployed healthy.
4. Roll back application code normally; browser-local configuration can remain inert. Disable the merge capability before changing permissions if any authorization gate fails.
