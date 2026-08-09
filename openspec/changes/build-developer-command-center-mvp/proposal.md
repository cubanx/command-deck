## Why

Developers currently assemble pull-request, check, deploy, and OpenSpec state by repeatedly visiting provider UIs and polling APIs. A small personal command center can make the important transitions visible while using webhook-fed local projections instead of continuously spending GitHub API quota.

## What Changes

- Add GitHub sign-in and GitHub App installation binding so every persisted view is scoped to a developer and/or installation from the first release.
- Add durable, idempotent GitHub and Railway webhook ingestion with provider-specific trust handling.
- Project open pull requests, reviews, checks, workflows, Railway deployments, and committed OpenSpec task progress into one local SQLite database.
- Add bootstrap, repair, explicit-detail, and infrequent serial reconciliation paths that use installation tokens, rate-limit backoff, and authenticated conditional requests.
- Add a compact responsive dashboard, live updates, focused empty/error states, and notifications for useful transitions only.
- Add a macOS-installable PWA shell without offline-first synchronization or a native desktop client.

## Capabilities

### New Capabilities
- `developer-access`: GitHub authentication, sessions, installation binding, and per-developer data isolation.
- `event-projections`: Trusted GitHub webhook ingestion, untrusted Railway hint verification, idempotency, and locally persisted provider projections.
- `provider-reconciliation`: Explicit bootstrap/repair and infrequent conditional reconciliation that minimizes GitHub API use and respects provider limits.
- `openspec-progress`: Presentation of committed OpenSpec task progress derived from repository artifacts.
- `command-center-dashboard`: Responsive operator-first presentation of the signed-in developer's pull requests, checks, reviews, deploys, and OpenSpecs.
- `transition-notifications`: Live dashboard updates and browser notifications for useful verified state transitions.
- `installable-pwa`: Installable web-app metadata and a minimal safe service-worker shell for macOS browsers.

### Modified Capabilities

None.

## Impact

- Introduces a Bun/TypeScript service using Bun's HTTP, SQLite, and test runtimes plus framework-free browser assets.
- Adds local SQLite state and environment-only GitHub App, OAuth, Railway API, session, and webhook secrets; no secret values are committed.
- Adds inbound GitHub and Railway webhook endpoints and outbound, read-only provider API clients, but does not configure or mutate either provider.
- Does not add deployment, teams, invitations, admin screens, broad RBAC, Postgres, a queue service, Electron, or local-tunnel infrastructure.
