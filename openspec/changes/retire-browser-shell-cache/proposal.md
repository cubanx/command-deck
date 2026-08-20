## Why

Command Deck.ai has served stale browser shells after local and deployed updates. The existing PWA contract mandates that cache behavior, so removing only a version number cannot make reloads reliably current.

## What Changes

- Retire application-owned app-shell and runtime-response caching.
- Serve a temporary, non-cached service worker that removes existing Cache Storage entries, unregisters itself, and refreshes controlled clients.
- Serve the HTML shell and its JavaScript and CSS with headers that require a fresh response on ordinary reloads.
- Preserve authenticated API, SSE, OAuth, webhook, notification, and other non-shell behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `installable-pwa`: Replace service-worker shell caching with a one-time service-worker retirement and fresh browser-shell delivery.

## Impact

Changes the web shell, static response headers, service-worker behavior, and focused server/runtime tests. No provider integration or deployment mutation is required.
