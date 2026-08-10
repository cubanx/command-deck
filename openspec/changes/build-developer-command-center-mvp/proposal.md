## Why

Developers currently assemble pull-request, check, deploy, and OpenSpec state by repeatedly visiting provider UIs and polling APIs. A small personal command center can make the important transitions visible while using webhook-fed local projections instead of continuously spending GitHub API quota.

## What Changes

- Add GitHub sign-in and GitHub App installation binding so every persisted view is scoped to a developer and/or installation from the first release.
- Add durable, idempotent GitHub and Railway webhook ingestion with provider-specific trust handling.
- Prevent browser clients from creating Railway project mappings; allow only operator-controlled mappings keyed by immutable GitHub user ID plus the deterministic local-demo fixture binding in this MVP.
- Project open pull requests, reviews, checks, workflows, Railway deployments, and committed OpenSpec task progress into one local SQLite database.
- Add bootstrap, repair, explicit-detail, and infrequent serial reconciliation paths that use installation tokens, rate-limit backoff, and authenticated conditional requests.
- Add a compact responsive dashboard, live updates, focused empty/error states, and notifications for useful transitions only.
- Add a macOS-installable PWA shell without offline-first synchronization or a native desktop client.
- Make `bun run dev` open a deterministic, locally seeded command center without provider credentials while making that access path impossible to enable in production.
- Make the dashboard exception-first: show only pull requests needing attention with their real GitHub links, complete provider status evidence, and any branch/SHA-linked OpenSpec progress including the full current unfinished group; show every deployment projection from the last 48 hours regardless of success or verification outcome.
- Track an optional automated reviewer independently from GitHub's formal review decision using an exact bot login plus configurable started/finished comment markers.
- Let a developer explicitly connect a local checkout through the browser so the PWA can present and open uncommitted OpenSpec task artifacts without uploading filesystem contents to Railway.

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
- Adds an explicit loopback-only local demo mode that reuses the production projection and dashboard paths without adding a fake provider or alternate UI.
- Extends existing pull-request and OpenSpec projections with the minimum head/source reference and active-group detail needed for reliable correlation, actionable links, and status presentation; no second workflow engine or provider polling path is added.
- Adds the GitHub `issue_comment` webhook and read-only Issues permission only when bot-review tracking is configured; comment text is evaluated solely as actor-scoped configured evidence.
- Adds an optional standards-based, read-only browser directory handle; unsupported browsers continue using committed provider projections.
- Adds local SQLite state and environment-only GitHub App, OAuth, Railway API, session, and webhook secrets; no secret values are committed.
- Adds inbound GitHub and Railway webhook endpoints and outbound, read-only provider API clients, but does not configure or mutate either provider.
- Does not add deployment, teams, invitations, admin screens, broad RBAC, Postgres, a queue service, Electron, or local-tunnel infrastructure.
