# Developer Command Center

A small, installable command center for a developer's open pull requests, checks, reviews, Railway deployments, and committed OpenSpec progress.

The service treats authenticated webhooks plus SQLite projections as the incremental source. Provider API calls are limited to explicit bootstrap/repair, targeted OpenSpec file reads, and six-hour conditional reconciliation.

## Local setup

Requirement: [Bun](https://bun.sh/).

```bash
bun install
bun run dev
```

Open `http://localhost:3000`. The development command binds to loopback and idempotently seeds one fictional developer with representative pull request, OpenSpec, deployment, and notification state. It uses the real dashboard, snapshot, SSE, scoping, and SQLite paths without provider credentials or cookies.

Use **Connect local checkout** to grant the browser read-only access to a repository. The PWA reads only `.git/HEAD` and `openspec/changes/*/tasks.md`, matches that evidence to a PR, presents the complete current unfinished group inside the PR card, and can open the selected task file without uploading its path or contents. Browsers without the native directory picker continue to show committed GitHub projections.

For real provider integration, copy `.env.example` to `.env`, supply a development GitHub App, leave `DCC_LOCAL_DEMO=0`, and use `bun run start`. Local webhooks additionally require a public forwarding URL.

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
| `DCC_LOCAL_DEMO` | Credential-free fixture access. `bun run dev` sets it to `1`; hosted or production environments reject it. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub App OAuth identity flow. The resulting user token is used only during the callback and is never persisted. |
| `GITHUB_APP_ID` / `GITHUB_APP_SLUG` / `GITHUB_APP_PRIVATE_KEY` | Installation flow, App JWTs, and installation-token repository reads. Encode private-key newlines as `\\n` when necessary. |
| `GITHUB_WEBHOOK_SECRET` | GitHub SHA-256 webhook HMAC verification. |
| `GITHUB_REVIEW_BOT_LOGIN` / `GITHUB_REVIEW_BOT_START_MARKER` / `GITHUB_REVIEW_BOT_DONE_MARKER` | Optional exact bot login and case-insensitive pull-request comment markers used together to project automated review progress. |
| `RAILWAY_WEBHOOK_TOKEN` | Unguessable Railway webhook URL segment used only as an intake filter. |
| `RAILWAY_API_TOKEN` | Read-only Railway Public API token used to verify deployment hints. |
| `RECONCILE_INTERVAL_MS` | Serial GitHub reconciliation interval; defaults to six hours and cannot be less than one minute. |

Keep values in the environment or a secret manager. Never commit `.env`, App private keys, webhook secrets, or provider tokens.

## GitHub App contract

Configure the App to request user authorization during installation and use:

- callback URL: `/auth/github/callback`
- webhook URL: `/webhooks/github`
- repository permissions: metadata read, pull requests read, checks read, actions read, contents read, and—when automated review tracking is configured—issues read
- events: installation, pull request, pull request review, check run, check suite, workflow run, push, and—when automated review tracking is configured—issue comment

The install callback does not trust its `installation_id`. It confirms the installation through `/user/installations` with the ephemeral user token before binding it to the signed-in developer. Repository automation then uses installation access tokens, not user access tokens.

Automated review tracking keeps GitHub's formal review decision separate. Only signed `issue_comment` deliveries on pull requests, from the exact configured bot login, can match the configured start or done marker; the done marker wins when both are present. Without matching evidence the bot-review state remains unknown.

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
