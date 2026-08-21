## Why

Review found that direct repair and OAuth bootstrap failures omit the bounded reconciliation evidence required by the existing contract, while reconciliation logs can retain raw provider diagnostics. The same completion behavior must hold at every repair entry point without exposing provider-controlled text.

## What Changes

- Centralize failed-installation persistence for scheduled reconciliation, manual repair, and OAuth bootstrap.
- Persist only existing classified, sanitized failure evidence and stale state.
- Log an error classification and safe operation context instead of raw provider errors.
- Add focused regression coverage for direct repair, OAuth bootstrap, and sanitized logs.

## Capabilities

No specification change. This implements the existing provider-reconciliation failure contract across its sibling entry points, so `skip_specs: true` is set.

## Impact

- Affected code: reconciliation completion handling in `src/github.ts`, direct bootstrap routes in `src/server.ts`, and focused server/provider tests.
- No API response, dashboard projection, provider, database schema, or production configuration changes.
