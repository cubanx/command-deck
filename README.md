# Developer Command Center

A small, installable command center for a developer's open pull requests, checks, reviews, GitHub deployment status, and committed OpenSpec progress.

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
| `NODE_ENV` | Set to `production` only for the hosted service; it enables fail-closed production validation. |
| `PUBLIC_URL` | Production HTTPS origin with no path, query, fragment, or credentials; must equal `https://${RAILWAY_PUBLIC_DOMAIN}`. |
| `RAILWAY_PUBLIC_DOMAIN` / `RAILWAY_VOLUME_MOUNT_PATH` | Railway-provided production cross-checks. Mount the single volume at `/data` and set `DATABASE_PATH=/data/command-center.sqlite`. |
| `DCC_LOCAL_DEMO` | Credential-free fixture access. `bun run dev` sets it to `1`; hosted or production environments reject it. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub App OAuth identity flow. The resulting user token is used only during the callback and is never persisted. |
| `GITHUB_APP_ID` / `GITHUB_APP_SLUG` / `GITHUB_APP_PRIVATE_KEY` | Installation flow, App JWTs, and installation-token repository reads. Encode private-key newlines as `\\n` when necessary. |
| `GITHUB_WEBHOOK_SECRET` | GitHub SHA-256 webhook HMAC verification. |
| `GITHUB_REVIEW_BOT_LOGIN` / `GITHUB_REVIEW_BOT_START_MARKER` / `GITHUB_REVIEW_BOT_DONE_MARKER` | Optional exact bot login and case-insensitive pull-request comment markers used together to project automated review progress. |
| `RECONCILE_INTERVAL_MS` | Serial GitHub reconciliation interval; defaults to six hours and cannot be less than one minute. |

Keep values in the environment or a secret manager. Never commit `.env`, App private keys, webhook secrets, or provider tokens.

## Production rollout contract

Repository configuration only is covered here; creating a Railway service, volume, domain, GitHub App, secrets, or deployment requires fresh authorization.

1. Run exactly one Railway service and replica from this Dockerfile. Attach one persistent volume at `/data`; set `NODE_ENV=production`, `DATABASE_PATH=/data/command-center.sqlite`, and set `PUBLIC_URL` to the generated HTTPS Railway domain. The root entrypoint repairs only the mount directory when required, then starts the application as `bun`; SQLite and WAL sidecars stay on that volume.
2. Set the required server variables by name only: `PUBLIC_URL`, `DATABASE_PATH`, `GITHUB_APP_ID`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_WEBHOOK_SECRET`. Railway supplies `PORT`, `RAILWAY_PUBLIC_DOMAIN`, and `RAILWAY_VOLUME_MOUNT_PATH`. Never place resolved values in evidence.
3. Railway activates only after `/ready` returns `200`; `/health` is liveness only. A volume-backed SQLite service is intentionally single-replica: redeploys briefly interrupt service, but retain the volume.
4. Before retrying with an existing volume, inspect its ownership under a separately authorized operational task. If existing database content is not accessible to `bun`, stop for an explicit repair decision; the entrypoint changes only the mount directory and never recursively changes its contents. Roll back by selecting the last known-good deployment while retaining the attached volume. If `/ready` does not recover, never recreate the volume as a shortcut.

Record redacted evidence only: timestamp, reviewed Git SHA, Railway deployment ID, variable-name checklist, `/health` and `/ready` statuses, OAuth result, GitHub delivery IDs/outcomes, deployment projection result, restart durability, and rollback outcome.

## GitHub App contract

Configure a private personal `cubanx` App, install it only on selected repositories, and use:

- homepage: `${PUBLIC_URL}`
- callback URL: `${PUBLIC_URL}/auth/github/callback`
- webhook URL: `${PUBLIC_URL}/webhooks/github`, enabled with SSL verification
- repository permissions: metadata read (implicit), pull requests read, checks read, actions read, contents read, deployments read; issues read only when review-bot tracking is configured
- events: installation, pull request, pull request review, check run, check suite, workflow run, push, deployment, and deployment status; issue comment only when review-bot tracking is configured

The install callback does not trust its `installation_id`. It confirms the installation through `/user/installations` with the ephemeral user token before binding it to the signed-in developer. Repository automation then uses installation access tokens, not user access tokens.

Automated review tracking keeps GitHub's formal review decision separate. Only signed `issue_comment` deliveries on pull requests, from the exact configured bot login, can match the configured start or done marker; the done marker wins when both are present. Without matching evidence the bot-review state remains unknown.

After binding an installation, bootstrap its current repositories and open pull requests with authenticated `POST /api/installations/:installationId/bootstrap`. `repair` is an equivalent explicit path. Both routes are restricted to a developer already bound to that installation.

## GitHub deployment contract

GitHub Deployment and Deployment status deliveries are signed with `GITHUB_WEBHOOK_SECRET`, deduplicated by delivery ID, and projected only within the delivery's installation. The dashboard shows repository-centric deployment status; it intentionally does not query Railway APIs or expose Railway logs, replicas, restarts, or configuration.

GitHub installation bindings determine dashboard visibility. Bootstrap and explicit repair use short-lived installation tokens with bounded conditional reads for recent deployments and their latest statuses; webhooks remain the incremental source. The dashboard retains only safe HTTP(S) deployment target and log links. Direct Railway access is a future capability, not a hidden credential waiting in the walls.

## Trust and data boundaries

- GitHub requests are size-limited and HMAC-verified against the raw body before durable inbox insertion. Delivery IDs are unique and redelivery-safe.
- Accepted payloads are persisted before `202`, processed serially, retried after restart, and cleared after successful projection.
- GitHub deployment status transitions are idempotent and only terminal state changes notify installation-bound users.
- Dashboard queries join the current developer to GitHub installations; pull requests are additionally filtered to the signed-in GitHub author.
- Sessions are high-entropy opaque tokens; only SHA-256 hashes are stored in SQLite and cookies are secure, HTTP-only, and same-site.
- Provider text is escaped before browser rendering. The service worker caches only public shell assets, never authenticated API or webhook traffic.

## API-budget behavior

Normal GitHub pull-request, review, check, workflow, installation, deployment, and deployment-status changes update projections from webhooks without list/search calls. Push events fetch only changed committed `openspec/changes/*/tasks.md` files. Bootstrap, repair, and reconciliation use installation tokens, authenticated ETags, serial requests, rate-limit headers, and bounded backoff. An authorized `304` preserves the projection without consuming the primary REST limit.

The MVP reconciles at most the first 100 repositories, first 100 open pull requests per repository, and 20 recent deployments per repository with one latest-status read each. Pagination is the explicit upgrade when a real installation reaches those ceilings.

## MVP limits and operational gate

- Notifications reach authenticated active clients through SSE and the browser Notification API. Closed-PWA Web Push is deferred.
- The service presents committed OpenSpec task files only; uncommitted worktree reporting is deferred.
- SQLite assumes one service process and one persistent volume. Postgres, Redis, queues, teams, invitations, admin/RBAC screens, Electron, local tunnels, and offline-first data sync are out of scope.
- This checkout does not create credentials, register an App, configure webhooks, deploy, or mutate external systems. Those actions require a separate reviewed operational OpenSpec and explicit authorization.

## License

[MIT](LICENSE) © 2026 cubanx.
