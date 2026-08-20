# installable-pwa Specification

## Purpose
TBD - created by archiving change build-developer-command-center-mvp. Update Purpose after archive.
## Requirements
### Requirement: Installable application shell
The web app SHALL deliver its operational HTML, CSS, and JavaScript shell assets through normal HTTP requests with `Cache-Control: no-cache`, without a manifest, standalone-display metadata, or ongoing service worker. To retire prior same-origin registrations, it SHALL temporarily serve `/sw.js` whose install handler calls `self.skipWaiting()` and whose activate handler deletes only `dcc-shell-v1`, `dcc-shell-v4`, `dcc-shell-v6`, and `dcc-shell-v10`, then unregisters itself. The browser SHALL not offer the command center as an installable web app.

#### Scenario: Browser loads the command center
- **WHEN** the service is delivered over a secure origin
- **THEN** the browser requests the current HTML, CSS, and JavaScript from the server without service-worker cache interception or an installability manifest

#### Scenario: Prior shell worker is updated
- **WHEN** a browser with a previously registered command-center service worker fetches `/sw.js`
- **THEN** the retirement worker skips waiting, deletes only the four known `dcc-shell` cache versions during activation, and unregisters without registering a replacement

#### Scenario: Browser evaluates installability
- **WHEN** the service is delivered over a secure origin
- **THEN** the browser cannot offer the command center as an installable standalone web app because it has no manifest or service worker

### Requirement: Safe shell delivery
The application SHALL NOT cache browser-shell or runtime responses through a service worker. During retirement of a previously installed worker, the service SHALL provide a non-cached cleanup worker that clears Cache Storage, unregisters, and refreshes its controlled clients. The service SHALL deliver the HTML shell and its JavaScript and CSS with response directives that require fresh retrieval on ordinary reloads. The application MUST NOT alter authenticated API responses, SSE data, OAuth callbacks, webhook traffic, or notification behavior.

#### Scenario: Existing client retires cached shell
- **WHEN** a client controlled by a previously installed application worker loads the cleanup worker
- **THEN** the worker clears Cache Storage, unregisters itself, and refreshes the controlled client without intercepting application requests

#### Scenario: Ordinary reload receives current shell
- **WHEN** a user reloads the application after a shell update
- **THEN** the browser revalidates the HTML, JavaScript, and CSS shell responses rather than using an application-managed cached copy
