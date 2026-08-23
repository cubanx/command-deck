# Command Center.ai

A small, installable command center for a developer's open pull requests, checks, reviews, GitHub deployment status, and committed OpenSpec progress.

The service treats authenticated webhooks plus MongoDB user projections as the incremental source. Provider API calls are limited to explicit bootstrap/repair, targeted OpenSpec file reads, and six-hour conditional reconciliation.

## Local setup

Requirement: [Bun](https://bun.sh/).

MongoDB is also required for tests and runtime. Set `MONGODB_URI_BASE` to an isolated local MongoDB endpoint, then run:

```bash
docker run --detach --rm --name dcc-mongodb-test --publish 127.0.0.1:27018:27017 mongo:8
bun install
bun run dev
MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun run test
MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun run test:mongo
```

Stop the disposable test database with `docker stop dcc-mongodb-test`. Tests create UUID-named guarded databases and drop only those databases.

Open `http://localhost:3000`. The development command binds to loopback and idempotently seeds one fictional developer with representative pull request, OpenSpec, deployment, and notification state. It uses the real dashboard, snapshot, SSE, scoping, and MongoDB paths without provider credentials or cookies.

Both top-level actions open one configuration screen for local checkouts, notifications, appearance, and manual reconciliation. **Reconcile now** reuses the authenticated, user-scoped installation reconciliation path and reports running, success, or sanitized failure state.

On browsers with the File System Access API, grant read-only access to one organization root and the PWA resolves known repositories beneath it by stable repository identity. Exact per-repository overrides cover nonstandard layouts; unresolved or unverified folders are never associated silently. Directory handles persist in IndexedDB and permissions are revalidated after reload. The browser reads only repository identity, `.git/HEAD`, and `openspec/changes/*/tasks.md`; handles, paths, files, branches, and local OpenSpec data never leave the browser. Browsers without the directory picker continue to show committed GitHub projections.

Appearance supports System, Dark, and Light and persists locally. System follows the current browser color scheme. Merge actions are absent while the GitHub App installation has read-only Pull requests permission and appear beside a title only when the projected PR is mergeable and the existing cheap UI gates pass; `operate-command-deck-merge-permission` owns the separate post-merge permission rollout and proof.

For real local provider integration, copy `.env.example` to `.env`, set `PUBLIC_URL=http://127.0.0.1:3000`, supply a development GitHub App, leave `DCC_LOCAL_DEMO=0`, and use `bun run start`. Register `http://127.0.0.1:3000/auth/github/callback` as that App's callback URL. Local webhooks additionally require a public forwarding URL.

Local validation:

```bash
bun run format
MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun run validate:all
openspec validate establish-code-quality-safety --strict
openspec validate improve-command-deck --strict
```

### Quality baseline

PR #8 adopts the portable Quality CI contract verified from Crisp Internal Apps commit `1a102a492d8f1de692023d977afb9d48c00d9457`:

- Biome `2.5.6`: tabs, double quotes, import organization, recommended lint rules, and Git-ignore awareness.
- CrapTS `0.1.1`: V8/Istanbul JSON coverage with a maximum CRAP score of `30` and at most `20` violations.
- Vitest and `@vitest/coverage-v8` `4.1.10`: the single test runner and coverage producer required by CrapTS.
- Existing TypeScript typechecking, the complete Mongo-backed test suite, frozen-lockfile installation, and Docker image construction remain required.

Only authored source and configuration are in scope. Narrow exclusions cover generated, vendored, binary, coverage, build, CodeGraph, and CC-licensed image assets where the applicable tool cannot inspect them meaningfully. The project does not copy Internal Apps' React/Vite generated-route, environment-contract, server-boundary, component/E2E, change-classification, deployment, or provider-specific jobs because those contracts do not exist here.

Use `bun run format` before review. `bun run validate:all` runs the ordered commands in `validation-commands.json` sequentially: `bun run check`, `bun run typecheck`, and `bun run check:crap`. `quality` remains an alias for that canonical command. `bun run test:coverage` writes V8 coverage to `coverage/unit/coverage-final.json`; `bun run check:crap` runs that suite and enforces `--max 30 --limit 20`.

Quality CI reads the same command list but runs its independent commands in parallel. Only CrapTS receives an isolated MongoDB service because it runs the coverage suite; `Validate All` is the stable aggregate. Docker build and tooling freshness remain separate checks. The workflow file does not make itself a provider-side required check; changing GitHub rulesets or branch protection remains a separately authorized repository operation.

## Configuration

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port; defaults to `3000`. |
| `MONGODB_URI_BASE` / `MONGODB_DATABASE` | MongoDB connection URI base and database name. |
| `NODE_ENV` | Set to `production` only for the hosted service; it enables fail-closed production validation. |
| `PUBLIC_URL` | Local OAuth: loopback HTTP origin with no path, query, fragment, or credentials (for example `http://127.0.0.1:3000`). Production: HTTPS origin that must equal `https://${RAILWAY_PUBLIC_DOMAIN}`. |
| `RAILWAY_PUBLIC_DOMAIN` | Railway-provided production cross-check for `PUBLIC_URL`. |
| `DCC_LOCAL_DEMO` | Credential-free fixture access. `bun run dev` sets it to `1`; hosted or production environments reject it. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub App OAuth identity flow. The resulting user token is used only during the callback and is never persisted. |
| `GITHUB_APP_ID` / `GITHUB_APP_SLUG` / `GITHUB_APP_PRIVATE_KEY` | Installation flow, App JWTs, and installation-token repository reads. Encode private-key newlines as `\\n` when necessary. |
| `GITHUB_WEBHOOK_SECRET` | GitHub SHA-256 webhook HMAC verification. |
| `GITHUB_REVIEW_BOT_LOGIN` / `GITHUB_REVIEW_BOT_START_MARKER` / `GITHUB_REVIEW_BOT_DONE_MARKER` | Optional exact bot login and case-insensitive pull-request comment markers used together to project automated review progress. |
| `RECONCILE_INTERVAL_MS` | Serial GitHub reconciliation interval; defaults to six hours and cannot be less than one minute. |

Keep values in the environment or a secret manager. Never commit `.env`, App private keys, webhook secrets, or provider tokens.

## Existing binding handoff

The post-merge cutover may seed only existing installation bindings, never SQLite data or provider projections:

```bash
bun run seed:bindings <github-user-id> <installation-id:account-login> [...]
```

Only the exact account logins `cubanx`, `Crisp-Inc`, and `hudson-law` are accepted. Run it with the approved production Environment only during the separate cutover OpenSpec.

## Production rollout contract

Repository configuration only is covered here; creating a Railway service, MongoDB deployment, domain, GitHub App, secrets, or deployment requires fresh authorization.

1. The dependent `operate-developer-command-center-mongodb-cutover` OpenSpec owns Atlas configuration, deployment, and the narrow binding handoff. Do not deploy this storage change directly.
2. Set the required server variables by name only: `PUBLIC_URL`, `MONGODB_URI_BASE`, `MONGODB_DATABASE`, `GITHUB_APP_ID`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_WEBHOOK_SECRET`. Railway supplies `PORT` and `RAILWAY_PUBLIC_DOMAIN`. Never place resolved values in evidence.
3. Railway activates only after `/ready` returns `200`; `/health` is liveness only. MongoDB connectivity and idempotent index initialization are the readiness dependency.

Record redacted evidence only: timestamp, reviewed Git SHA, Railway deployment ID, variable-name checklist, `/health` and `/ready` statuses, OAuth result, GitHub delivery IDs/outcomes, deployment projection result, restart durability, and rollback outcome.

## GitHub App contract

Configure a private GitHub App. `cubanx` and `Crisp-Inc` may use all repositories; every other installation account must use explicitly selected repositories. Use:

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
- Accepted payloads are persisted before `202`, processed serially, retried after restart, and cleared after successful projection. Inbox draining assumes one application process; multi-replica operation requires atomic delivery claims.
- GitHub deployment status transitions are idempotent and only terminal state changes notify installation-bound users.
- Dashboard queries join the current developer to GitHub installations; pull requests are additionally filtered to the signed-in GitHub author.
- Sessions are high-entropy opaque tokens; only SHA-256 hashes are stored in MongoDB and cookies are secure, HTTP-only, and same-site.
- Provider text is escaped before browser rendering. The service worker caches only public shell assets, never authenticated API or webhook traffic.

## API-budget behavior

Normal GitHub pull-request, review, check, workflow, installation, deployment, and deployment-status changes update projections from webhooks without list/search calls. Push events fetch only changed committed `openspec/changes/*/tasks.md` files. Bootstrap, repair, and reconciliation use installation tokens, authenticated ETags, serial requests, rate-limit headers, and bounded backoff. An authorized `304` preserves the projection without consuming the primary REST limit.

Reconciliation follows GitHub Link pagination for repositories, open pull requests, and deployment lists. The dashboard retains the newest 20 deployment projections per repository with one latest-status read each. Deployment target and log links are retained only when they are safe HTTP(S) URLs.

## MVP limits and operational gate

- Notifications reach authenticated active clients through SSE and the browser Notification API. Closed-PWA Web Push is deferred.
- The service presents committed OpenSpec task files only; uncommitted worktree reporting is deferred.
- MongoDB uses a bounded user aggregate with a 12 MiB application guard. Postgres, Redis, queues, teams, invitations, admin/RBAC screens, Electron, local tunnels, and offline-first data sync are out of scope.
- This checkout does not create credentials, register an App, configure webhooks, deploy, or mutate external systems. Those actions require a separate reviewed operational OpenSpec and explicit authorization.

## License

[MIT](LICENSE) © 2026 cubanx.

The Command Deck application icon adapts [OpenMoji's control knobs](https://openmoji.org/library/emoji-1F39B/) by Sina Schulz. Colors and background were modified for this project. The adapted artwork is distributed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); detailed provenance accompanies the assets.
