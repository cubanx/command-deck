## Railway production resource setup

- Timestamp: 2026-08-10T19:50Z
- Workspace: Crisp-Inc
- Project: `b2fa…b892` (`courteous-luck`)
- Environment: `a2aa…ee54` (`production`)
- Service: `1809…12b3` (`developer-command-center`)
- Volume: `12db…df2c` (`developer-command-center-volume`), mounted at `/data`, status `Ready`
- Domain: `developer-command-center-production.up.railway.app`, status `ACTIVE`
- Runtime shape: one SFO replica
- Deployment: not performed
- Secrets: not recorded

## Railway production variables and runtime settings

- Timestamp: 2026-08-11T13:13Z
- Credential governance verified: each source item has the sole `operational-credential` tag and complete owner, scope, destinations, rotation-authority, and purpose metadata
- Canonical secret sources: OAuth client secret `zoev…uaqi`, App private key `m5h…sh2m`, webhook signing secret `j53s…rnnu` in the Automation vault
- Operator variables present: `NODE_ENV`, `PUBLIC_URL`, `DATABASE_PATH`, `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_CLIENT_ID`
- Directly projected secret variables present: `GITHUB_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`
- Railway-provided hosting variables verified by name, including `RAILWAY_PUBLIC_DOMAIN` and `RAILWAY_VOLUME_MOUNT_PATH`
- Runtime readback: Dockerfile builder at `Dockerfile`; start command `bun run src/server.ts`; healthcheck `/ready`; timeout 60 seconds; one SFO replica
- Restart readback: provider-default `ON_FAILURE` policy (omitted from the normalized export) with 3 maximum retries; application SIGTERM handling owns drain behavior
- Deployment list before and after configuration: empty; deploy triggers were suppressed for variable writes and the configuration mutation returned no deployment ID
- Secret values: streamed directly from immutable 1Password references; not displayed or recorded

## GitHub App configuration

- Timestamp: 2026-08-11T12:21Z
- Owner: `cubanx` (personal account)
- App: `Command Deck.ai`; App ID `4558…8048`; slug `command-deck-ai`
- Installability: only on the `cubanx` account; installed only on `cubanx/dev-command-center`
- Homepage: `https://developer-command-center-production.up.railway.app`
- OAuth callback: `https://developer-command-center-production.up.railway.app/auth/github/callback`
- Webhook: `https://developer-command-center-production.up.railway.app/webhooks/github`; active; SSL verification enabled
- Repository permissions: Metadata read (mandatory), Actions read, Checks read, Contents read, Pull requests read
- Events: Installation (provider lifecycle), Check run, Check suite, Pull request, Pull request review, Push, Workflow run
- OAuth options: user-token expiration disabled; OAuth-on-install disabled; device flow disabled; no setup URL
- Credential sources verified: OAuth client secret `zoev…uaqi`, App private key `m5h…sh2m`, webhook signing secret `j53s…rnnu` in the Automation vault
- Webhook signing secret was rotated after a rejected-name validation response exposed the superseded value; only the replacement is retained
- Secret values: not recorded

## GitHub App deployment permission update

- Timestamp: 2026-08-11T12:53Z
- App: `Command Deck.ai`; owner `cubanx`; slug `command-deck-ai`
- Repository permission added: Deployments read-only
- Events added: Deployment, Deployment status
- Provider verification: saved settings reopened and showed the read-only permission and both checked events
- Secret values: not accessed or recorded

## GitHub App installation

- Timestamp: 2026-08-11T13:20Z
- App: `Command Deck.ai`; App ID `4558…8048`; installation ID `1529…2571`
- Account: `cubanx`
- Repository access: only selected repositories; exactly `cubanx/dev-command-center`
- Permission review: read-only Actions, Checks, Contents, Deployments, Metadata, and Pull requests
- Event review: Installation, Check run, Check suite, Deployment, Deployment status, Pull request, Pull request review, Push, and Workflow run
- Provider verification: installation success alert displayed and saved installation page showed one selected repository
- Secret values: not accessed or recorded

## GitHub-only deployment-source implementation

- Timestamp: 2026-08-11
- Runtime boundary: no Railway API token, connection mapping, webhook route, reconciliation flow, or client remains in the application. Railway remains the hosting provider only.
- Storage: additive `github_deployments` table leaves legacy SQLite tables intact.
- Incremental source: signed GitHub `deployment` and `deployment_status` deliveries; terminal transition notifications deduplicate per user.
- Repair source: bounded, conditional installation-token reads for selected repositories and recent deployment statuses.
- Local verification: focused tests, full `bun test`, `bun run typecheck`, `git diff --check`, and strict OpenSpec validation passed. No provider mutation or production deployment was performed for this implementation evidence.
