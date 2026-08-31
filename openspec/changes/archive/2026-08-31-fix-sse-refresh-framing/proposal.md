## Why

The authenticated refresh stream writes literal `\\n` characters instead of Server-Sent Events line delimiters, so native `EventSource` never dispatches the named refresh event and the visible dashboard remains stale until a manual reload.

## What Changes

- Emit each existing server-side refresh notification as one valid LF-delimited `event: refresh` SSE frame.
- Add a focused server regression check for the exact event name, data line, blank-line terminator, and absence of literal `\\n` bytes.
- Reuse the mounted `SnapshotEvents` listener and canonical snapshot-query invalidation path without polling or another event system.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `transition-notifications`: Require authenticated refresh notifications to use standards-valid SSE framing that native `EventSource` can dispatch.

## Impact

- Affects the two refresh-frame writes in `src/server.ts` and focused assertions in `test/server.test.ts`.
- Preserves the `/events` route, authenticated per-developer stream scope, client query-invalidation behavior, accessibility, and existing trust boundaries.
- Adds no dependency, API, polling path, deployment action, or provider operation.
