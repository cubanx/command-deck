## Context

The current PWA contract caches the browser shell and its assets. Existing browsers can therefore continue rendering an older shell after an update. See proposal.md for the motivation.

## Goals / Non-Goals

**Goals:**

- Retire already-installed service workers and their Cache Storage entries.
- Ensure the browser requests the current HTML, JavaScript, and CSS shell on reload.
- Keep the retirement path small and safe for authenticated application traffic.

**Non-Goals:**

- Removing manifest metadata or offline-install UI.
- Changing API, SSE, OAuth, webhook, or notification delivery.

## Decisions

- Serve a minimal cleanup service worker without a fetch handler. It is the only reliable way to remove workers already installed by previous versions; omitting the file would leave those workers active.
- Send `no-cache` for the cleanup worker and browser-shell responses. This requests revalidation without adding application-managed storage; versioned asset URLs and precaches are removed.
- Cleanup deletes all Cache Storage entries, unregisters, and navigates currently controlled windows. Unregistration prevents repeating it after the refresh.

## Risks / Trade-offs

- A controlled client refreshes once during retirement → The cleanup worker unregisters before navigation, so the next load follows the ordinary network path.
- Fresh responses add requests on reload → Command Deck.ai is a small authenticated dashboard and correctness outweighs a shell-cache optimization.

## Migration Plan

1. Deploy the cleanup worker and fresh-response headers.
2. A browser with an existing worker retrieves the cleanup worker, which clears its cached shell and reloads the controlled client.
3. New loads do not register a worker or cache app-shell responses.

Rollback is the ordinary deployment rollback; it restores the prior worker only if intentionally required.
