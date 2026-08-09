## Context

The repository contains only a stock spec-driven OpenSpec initialization. There are no runtime, dependency, UI, persistence, or deployment conventions to preserve and no CodeGraph index to use.

The command center must remain reachable for provider webhooks when a developer's Mac sleeps. GitHub documents a ten-second webhook response window, stable delivery identifiers, HMAC validation, and no automatic failed-delivery redelivery. GitHub also documents that authenticated conditional `304` responses do not consume the primary REST limit and recommends serial requests plus rate-limit-aware backoff. Railway documents JSON deployment webhooks and a GraphQL Public API, but its webhook documentation does not define a signature. Those properties make a hosted single process with durable local projections the smallest credible shape.

The visual reference is Crisp `internal-apps`, specifically its neutral compact shell, bordered cards, responsive grid/table containers, plain status badges, and explicit empty states. The seasonal appearance system, masthead art, portal hierarchy, auth/profile/permission machinery, and broad React dependency surface are deliberately excluded.

## Goals / Non-Goals

**Goals:**

- Provide an installable, responsive personal command center for open pull requests, checks, reviews, workflows, verified Railway deployments, and committed OpenSpec progress.
- Scope all persisted developer-facing state by user and/or GitHub App installation.
- Make durable webhook-fed projections the normal incremental path and reserve provider reads for bootstrap, repair, explicit detail, targeted artifact reads, and infrequent reconciliation.
- Verify every trustworthy boundary before creating projections or notifications.
- Keep the entire MVP locally runnable and testable without configuring or mutating external systems.

**Non-Goals:**

- Teams, invitations, admin screens, general RBAC, billing, or a general SaaS platform.
- Electron, a native menu-bar client, a Mac-hosted webhook receiver, or a local tunnel.
- Postgres, Redis, a queue service, multiple runtime services, offline-first data synchronization, or a frontend framework.
- Uncommitted OpenSpec state, repository cloning, or a local worktree reporter.
- Live deployment, credential creation, provider webhook/App setup, or production verification in this change.
- Background Web Push while the PWA is closed; active signed-in clients receive browser notifications in the MVP.

## Decisions

### One Bun process with SQLite and static browser assets

Use `Bun.serve`, `bun:sqlite`, Bun tests, and standards-based browser HTML/CSS/JavaScript. The process serves the API, webhook endpoints, SSE stream, and PWA assets. SQLite runs in WAL mode on a persistent volume in a future deployment.

This avoids a framework, bundler, ORM, queue, cache, and second service. A hosted service remains necessary because a sleeping Mac cannot acknowledge webhooks and GitHub does not automatically retry failures. Postgres or a durable external queue becomes appropriate only if one process/volume cannot meet measured availability or throughput.

### GitHub OAuth identifies people; GitHub App installations authorize repository reads

GitHub OAuth uses state-bound callbacks to identify the developer. The user access token is used only to fetch identity during the callback and is not persisted. Random opaque sessions are stored as SHA-256 hashes and delivered in secure, HTTP-only, same-site cookies.

GitHub App installation bindings are a many-to-many relation between users and installations. Repository, pull-request, workflow, check, and OpenSpec rows belong to an installation. Every signed-in query joins through the current user's installation bindings. Installation access tokens, minted from the App private key, perform repository API reads so automation does not spend the developer's personal token budget.

### A SQLite inbox is the queue

The request path reads the raw body, validates authenticity/route secret and size, inserts a unique provider delivery key plus payload in one transaction, and returns `202` before projection work. An in-process drain handles pending rows; startup also drains them. After successful processing, the raw payload is cleared while the delivery identifier and outcome remain for idempotency and diagnostics.

GitHub payloads are parsed only after a timing-safe SHA-256 HMAC comparison. Re-deliveries reuse the delivery ID and receive a successful duplicate acknowledgement without reapplying state or notifications.

### GitHub events are authoritative updates; Railway events are hints

Supported GitHub pull request, review, check suite/run, workflow run, installation, and push events update only the affected rows. Unknown event/action pairs are recorded as ignored rather than guessed.

Railway webhook URLs contain an environment-supplied unguessable route token, but this is only an intake filter because Railway does not document payload signing. A strict shape validator extracts project, service, environment, and deployment IDs. The worker then queries recent deployments through Railway's read-only Public API using the supplied project/service IDs and accepts the status only when the authoritative response contains the hinted deployment. Until then the row remains `pending_verification`; no success/failure notification is emitted.

### Provider reads are narrow, serial, conditional, and rate-limit aware

An explicit bootstrap imports installations' repositories and open pull requests. Repair can target one installation or repository. Explicit detail reads are user initiated. A configurable reconciliation timer defaults to six hours and is disabled when provider credentials are absent.

GitHub GETs are performed serially. Stable request keys retain ETags; authenticated `If-None-Match` reads preserve existing projections on `304`. `Retry-After`, primary reset headers, and exponential backoff are honored with bounded attempts. Provider errors remain visible and never turn stale evidence into a successful state.

### OpenSpec is parsed, not reimplemented

Push payload file lists select changed committed `openspec/changes/*/tasks.md` paths. The worker fetches only those files using an installation token, counts standard Markdown task checkboxes, and stores completed/total progress plus the source commit. Deletion removes the projection. A transition to all-complete can notify the bound developer. No workflow rules or duplicate task engine are introduced.

### SSE drives active-client updates and notifications

One authenticated SSE endpoint fans out a small `refresh` event after committed projection changes. The browser refetches its snapshot and, when permission was explicitly granted, asks the service worker to show a notification for newly persisted useful transitions. Notification rows have a user-scoped dedupe key.

Native Web Push is deferred because it adds key management, subscription lifecycle, encryption code/dependencies, and a second delivery path. Add it only when closed-PWA notification delivery is required.

### The UI uses a tiny Crisp-sibling token layer

The browser UI uses a restrained slate-neutral palette, compact labels, bordered cards, semantic green/red/yellow/blue states, responsive grids, scroll-contained tables, visible focus rings, and explicit loading/empty/error states. It has one flat command-center route and no copied Mantine/Tailwind, portal registry, theme selector, seasonal assets, or permission stack.

## Risks / Trade-offs

- [Single-process SQLite availability depends on one persistent volume] → Keep the design one-process for MVP, use WAL and transactions, expose health/readiness, and move to Postgres only after measured need.
- [The process can crash after accepting a webhook] → Persist before `202` and drain pending inbox rows at startup.
- [GitHub webhook schemas evolve] → Validate the minimum required fields, ignore unknown actions safely, and retain sanitized processing errors.
- [A compromised Railway webhook URL can create traffic] → Require an environment-only route token, enforce body limits/shape validation, and require authoritative API reconciliation before state or notification consequences.
- [Webhook delivery can still be missed during service downtime] → Provide explicit repair and infrequent reconciliation; live deployment must separately prove persistence, restart recovery, and missed-delivery recovery.
- [Active-client notifications do not wake a closed PWA] → State this MVP limit clearly; add standards-based Web Push only when closed-app delivery is required.
- [Repository contents reads consume GitHub quota] → Fetch only changed committed OpenSpec task files and retain conditional request metadata.
- [SQLite rows could cross users if a query omits scope] → Centralize dashboard reads through installation-binding joins and test negative cross-user cases.

## Migration Plan

1. Implement and validate the service locally with synthetic provider payloads and temporary SQLite databases.
2. Stop for human review. This change does not create credentials, configure providers, deploy, or perform production writes.
3. If approved later, create a separate operational OpenSpec for GitHub App/OAuth registration, least-privilege secrets, Railway webhook/API configuration, a persistent volume, deployment, replay/restart checks, and rollback.
4. Rollback for a future deployment is to stop webhook delivery, restore the previous service image, and retain the SQLite volume for replay/repair. Schema changes in this MVP are additive bootstrap creation only.

## Open Questions

- Which hosted service and persistent-volume location will be selected is intentionally deferred to the operational change.
- Whether closed-PWA Web Push is worth its additional key/subscription lifecycle remains a post-MVP product decision.
