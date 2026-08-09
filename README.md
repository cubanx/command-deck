# Developer Command Center

A small, installable command center for a developer's open pull requests, checks, reviews, Railway deployments, and committed OpenSpec progress.

The service treats authenticated webhooks plus SQLite projections as the incremental source. Provider API calls are limited to explicit bootstrap/repair, targeted OpenSpec file reads, and six-hour conditional reconciliation.

## Local setup

Requirements: [Bun](https://bun.sh/) and a GitHub App when exercising provider flows.

```bash
cp .env.example .env
bun install
bun run dev
```

Open `http://localhost:3000`. The public shell, `/health`, and `/ready` work without provider credentials; sign-in, installation, provider reads, and webhooks remain disabled until their variables are supplied.

Local validation:

```bash
bun run typecheck
bun test
openspec validate build-developer-command-center-mvp --strict
```

## Configuration

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port; defaults to `3000`. |
| `DATABASE_PATH` | SQLite path; defaults to `./data/command-center.sqlite`. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub App OAuth identity flow. The resulting user token is used only during the callback and is never persisted. |
| `GITHUB_APP_ID` / `GITHUB_APP_SLUG` / `GITHUB_APP_PRIVATE_KEY` | Installation flow, App JWTs, and installation-token repository reads. Encode private-key newlines as `\\n` when necessary. |
| `GITHUB_WEBHOOK_SECRET` | GitHub SHA-256 webhook HMAC verification. |
| `RAILWAY_WEBHOOK_TOKEN` | Unguessable Railway webhook URL segment used only as an intake filter. |
| `RAILWAY_API_TOKEN` | Read-only Railway Public API token used to verify deployment hints. |
| `RECONCILE_INTERVAL_MS` | Serial GitHub reconciliation interval; defaults to six hours and cannot be less than one minute. |

Keep values in the environment or a secret manager. Never commit `.env`, App private keys, webhook secrets, or provider tokens.

## GitHub App contract

Configure the App to request user authorization during installation and use:

- callback URL: `/auth/github/callback`
- webhook URL: `/webhooks/github`
- repository permissions: metadata read, pull requests read, checks read, actions read, and contents read
- events: installation, pull request, pull request review, check run, check suite, workflow run, and push

The install callback does not trust its `installation_id`. It confirms the installation through `/user/installations` with the ephemeral user token before binding it to the signed-in developer. Repository automation then uses installation access tokens, not user access tokens.

After binding an installation, bootstrap its current repositories and open pull requests with authenticated `POST /api/installations/:installationId/bootstrap`. `repair` is an equivalent explicit path. Both routes are restricted to a developer already bound to that installation.

## Railway contract

Railway's webhook documentation does not define payload signing. Configure the target as `/webhooks/railway/<RAILWAY_WEBHOOK_TOKEN>`. Payloads remain untrusted hints even after the route token matches: the service validates identifiers, queries recent deployments through Railway's read-only GraphQL API, and persists or notifies only when the exact project, service, environment, and deployment match.

A signed-in developer binds a personal Railway scope with:

```js
await fetch("/api/railway/connections", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    projectId: "project-id",
    serviceId: "service-id",
    environmentId: "environment-id"
  })
});
```

This only stores a user-scoped read mapping; it does not configure or mutate Railway.

## Trust and data boundaries

- GitHub requests are size-limited and HMAC-verified against the raw body before durable inbox insertion. Delivery IDs are unique and redelivery-safe.
- Accepted payloads are persisted before `202`, processed serially, retried after restart, and cleared after successful projection.
- Railway hints retain their payload while verification is pending and cannot trigger success/failure notifications before an authoritative match.
- Dashboard queries join the current developer to GitHub installations and Railway project/service/environment mappings. Pull requests are additionally filtered to the signed-in GitHub author.
- Sessions are high-entropy opaque tokens; only SHA-256 hashes are stored in SQLite and cookies are secure, HTTP-only, and same-site.
- Provider text is escaped before browser rendering. The service worker caches only public shell assets, never authenticated API or webhook traffic.

## API-budget behavior

Normal GitHub pull-request, review, check, workflow, and installation changes update projections from webhooks without list/search calls. Push events fetch only changed committed `openspec/changes/*/tasks.md` files. Bootstrap, repair, and reconciliation use installation tokens, authenticated ETags, serial requests, rate-limit headers, and bounded backoff. An authorized `304` preserves the projection without consuming the primary REST limit.

The MVP reconciles at most the first 100 repositories and first 100 open pull requests per repository. Pagination is the explicit upgrade when a real installation reaches that ceiling.

## MVP limits and operational gate

- Notifications reach authenticated active clients through SSE and the browser Notification API. Closed-PWA Web Push is deferred.
- The service presents committed OpenSpec task files only; uncommitted worktree reporting is deferred.
- SQLite assumes one service process and one persistent volume. Postgres, Redis, queues, teams, invitations, admin/RBAC screens, Electron, local tunnels, and offline-first data sync are out of scope.
- This checkout does not create credentials, register an App, configure webhooks, deploy, or mutate external systems. Those actions require a separate reviewed operational OpenSpec and explicit authorization.

## License

[MIT](LICENSE) © 2026 cubanx.
