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

## GitHub App configuration

- Timestamp: 2026-08-11T12:21Z
- Owner: `cubanx` (personal account)
- App: `Command Deck.ai`; App ID `4558…8048`; slug `command-deck-ai`
- Installability: only on the `cubanx` account; repository selection deferred to task 5.2
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

## GitHub-only deployment-source implementation

- Timestamp: 2026-08-11
- Runtime boundary: no Railway API token, connection mapping, webhook route, reconciliation flow, or client remains in the application. Railway remains the hosting provider only.
- Storage: additive `github_deployments` table leaves legacy SQLite tables intact.
- Incremental source: signed GitHub `deployment` and `deployment_status` deliveries; terminal transition notifications deduplicate per user.
- Repair source: bounded, conditional installation-token reads for selected repositories and recent deployment statuses.
- Local verification: focused tests, full `bun test`, `bun run typecheck`, `git diff --check`, and strict OpenSpec validation passed. No provider mutation or production deployment was performed for this implementation evidence.
