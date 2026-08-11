## Context

PR #1 merged the Bun/TypeScript MVP at `6a579dfb513e933eb510fa466ec3eeefccaeeb34`. The service already validates GitHub webhook signatures, persists delivery IDs before returning `202`, uses installation tokens for repository API traffic, and exposes `/health` plus database-backed `/ready`. Production now needs a reproducible container, durable SQLite path, one canonical public origin, GitHub-native deployment evidence, and evidence-gated operations.

Railway currently requires a Dockerfile for Bun detection, injects `PORT`, provides `RAILWAY_PUBLIC_DOMAIN` and `RAILWAY_VOLUME_MOUNT_PATH`, mounts volumes only at service runtime, and uses an HTTP `200` healthcheck to gate deployment activation. A volume-backed service has brief redeploy downtime, which is acceptable for this personal single-service tool.

## Goals / Non-Goals

**Goals:**

- Run one pinned Bun image as a non-root process with a locked install and one start command.
- Persist SQLite and its WAL files under one Railway volume mount.
- Make one HTTPS public origin the source of truth for OAuth redirects and cookies.
- Specify the personal GitHub App's least permissions, events, URLs, secret inputs, and installation-token use.
- Use signed GitHub deployment events as the incremental deployment source and installation-token reads only for bootstrap and repair.
- Keep Railway credentials, runtime API reads, connection mappings, and webhook intake out of the application.
- Fail startup on missing, malformed, placeholder, or mutually inconsistent production configuration.
- Gate activation on database readiness and retain a cheap liveness endpoint.
- Define reversible rollout steps and exact completion evidence without performing external mutations.

**Non-Goals:**

- Teams, RBAC, queues, Postgres, multiple replicas, Electron, offline-first sync, or a generalized deployment platform.
- Direct Railway observability, logs, runtime control, or cross-project inventory.
- Creating or changing GitHub, Railway, or 1Password resources in repository code.
- Claiming production verification before the authorized external steps are executed and recorded.

## Decisions

### One Dockerfile and one Railway service

Use a root `Dockerfile` based on a pinned official Bun image, `bun install --frozen-lockfile`, a non-root runtime user, and `bun run src/server.ts`. Add `railway.json` only for the start command, `/ready` healthcheck, restart policy, and a bounded healthcheck timeout. This is more reproducible than provider autodetection and smaller than adding orchestration.

Alternative: Railpack/Nixpacks. Rejected because Railway's Bun guide still calls for a Dockerfile and an explicit image makes rollback behavior inspectable.

### One volume at `/data`

Attach one Railway volume at `/data` and set `DATABASE_PATH=/data/command-center.sqlite`. SQLite WAL sidecars remain on the same filesystem. Startup MUST reject a production database path outside the Railway-reported mount path, a missing mount declaration, or an in-memory database.

Alternative: Postgres or object-storage backups. Rejected for this single-user service; add a managed database only if single-volume availability or multi-replica requirements become real.

### Explicit canonical origin

Add `PUBLIC_URL` as an absolute HTTPS origin with no path, query, fragment, or credentials. Production derives the OAuth redirect URI as `${PUBLIC_URL}/auth/github/callback`, sets secure cookies, and rejects requests whose forwarded origin is inconsistent. Trust `X-Forwarded-Proto` and `X-Forwarded-Host` only in production behind Railway, using their first values after strict validation.

The Railway domain is generated first, then recorded as `PUBLIC_URL`; `RAILWAY_PUBLIC_DOMAIN` is a cross-check, not a secret. A future custom domain is a deliberate coordinated change to `PUBLIC_URL` and the GitHub App callback/webhook URLs.

### Personal GitHub App contract

Use a private personal-account GitHub App installed only on selected repositories. Configure:

- Homepage: `PUBLIC_URL`
- OAuth callback: `PUBLIC_URL/auth/github/callback`
- Webhook: `PUBLIC_URL/webhooks/github`, active with SSL verification
- Repository permissions: Metadata read (implicit), Pull requests read, Checks read, Actions read, Contents read, Deployments read; Issues read only when review-bot tracking is configured
- Events: Installation, Pull request, Pull request review, Check run, Check suite, Workflow run, Push, Deployment, Deployment status; Issue comment only when review-bot tracking is configured

`GITHUB_APP_ID`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_WEBHOOK_SECRET` are server-only. Repository API calls continue to use installation tokens; the OAuth user token is only for identity. No resolved value appears in code, docs, logs, evidence, or Git history.

Alternative: PATs or OAuth tokens for repository reads. Rejected because they widen authority and break installation scoping.

### GitHub is the deployment source

Signed `deployment` and `deployment_status` webhooks update an additive `github_deployments` projection keyed by installation, repository, and GitHub deployment ID. Dashboard access follows the existing user-to-installation boundary. Only terminal status transitions create notifications. Bootstrap and repair use bounded, conditional installation-token reads for selected repositories; webhooks remain the primary incremental source.

Railway remains hosting-only. The runtime has no Railway API token, connection mappings, or Railway webhook route. This intentionally omits Railway-native logs, replicas, restarts, and cross-project configuration from the first production rollout.

### Operational gates and evidence

Repository work may complete before deployment, but production tasks stay unchecked. Activation requires `/health` and `/ready` returning `200`; `/ready` verifies the persistent database can be queried. Verification is bounded to one test installation, one selected repository, one synthetic or naturally generated event per configured event family, one OAuth login, one restart durability check, and one rollback rehearsal/record. Evidence records timestamp, deployed Git SHA, Railway deployment ID, redacted configuration-name checklist, relevant GitHub delivery IDs, HTTP statuses, and projection outcome—never secrets or payloads.

## Risks / Trade-offs

- [Single attached volume causes brief redeploy downtime and prevents horizontal replicas] → Keep one replica and document this ceiling; migrate storage before scaling.
- [Wrong volume path silently creates ephemeral SQLite data] → Fail production startup unless `DATABASE_PATH` is inside `RAILWAY_VOLUME_MOUNT_PATH`; verify persistence across a restart.
- [Proxy headers can be spoofed outside Railway] → Honor them only in production and require equality with `PUBLIC_URL` before OAuth/session behavior.
- [GitHub permissions drift or are over-broad] → Keep a checked-in least-privilege matrix and verify installed permissions/events during rollout.
- [Webhook retries duplicate work] → Continue durable delivery-ID deduplication and acknowledge accepted deliveries quickly.
- [GitHub deployment metadata omits Railway-native runtime detail] → Keep the first rollout repository-centric; add direct Railway access only with a separate reviewed capability.
- [Existing local databases contain Railway projection tables] → Add a new GitHub-native table without rebuilding or deleting legacy tables.

## Migration Plan

1. Merge repository configuration only after tests and strict OpenSpec validation pass.
2. With explicit authorization, create/select one Railway service from current `main`, attach a `/data` volume, generate its public domain, and configure healthcheck `/ready`.
3. With explicit authorization, create/update the personal GitHub App using the exact URLs, permissions, and events above; install it only on selected repositories.
4. Inject server variables from approved 1Password-backed sources without displaying values. Deploy the exact reviewed Git SHA.
5. Capture bounded verification evidence. Keep production tasks unchecked until each artifact exists.
6. Roll back by selecting the last known-good Railway deployment while retaining the volume. If readiness does not recover, stop traffic and diagnose the mounted database; do not delete or recreate the volume.

## Open Questions

None for repository implementation. Direct Railway observability is explicitly deferred. The actual hosting IDs, GitHub App installation ID, and secret item references are runtime evidence supplied only during explicitly authorized production execution.
