## Why

Developers cannot use a real local GitHub App flow because development omits its callback origin and keeps cookies secure over loopback HTTP. Provider reads can also outlive Bun's default response window, leaving reconciliation locked until GitHub eventually responds.

## What Changes

- Enable non-demo local development with an explicit loopback OAuth callback and an HTTP-compatible session cookie, while retaining the hosted HTTPS/Railway contract.
- Define local configuration through a checked-in `.env.schema` and pending Varlock schema/runtime validation and scanning; Varlock's official 1Password plugin bulk-loads non-credential configuration from the existing local 1Password Environment and resolves four GitHub credentials from their canonical items without a committed or generated `.env` file.
- Bound every server-side GitHub request, retain serial retry behavior, report safe timeout failures, release the reconciliation lock after failure, and allow Bun enough idle time for legitimate serial reconciliation.
- Make the configuration avatar-menu caret more visible and repair existing Biome and stale logging-test baselines so `validate:all` and CI are green.
- Order equally ready pull requests by ascending pull-request number as the accepted closest-available age proxy.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `developer-access`: Local non-demo developer OAuth, session-cookie, and configuration behavior changes while preserving the existing 1Password Environment as authority.
- `provider-reconciliation`: GitHub request bounds, timeout diagnostics, reconciliation recovery, and serial-read behavior change.
- `command-center-dashboard`: Default closest-to-merge tie-breaking uses the oldest pull-request number first.

## Impact

- Affected code: `src/config.ts`, `src/server.ts`, `src/github.ts`, and configuration UI and pull-request ordering under `src/web/`.
- Affected validation and documentation: configuration, GitHub client, server, and quality tests; local-development docs; package and quality-workflow configuration.
- Dependency: add Varlock and its official 1Password plugin for schema/runtime loading and repository scanning; the existing 1Password Environment and canonical items remain authoritative.
