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

### Requirement: Safe shell caching
The service SHALL not provide an ongoing application-controlled shell cache. Its normal HTTP HTML, CSS, and JavaScript shell asset responses SHALL use `Cache-Control: no-cache`; the dashboard SHALL not register a service worker or cache authenticated API responses, SSE data, OAuth callbacks, or webhook traffic. The temporary retirement worker MAY delete only the named legacy shell caches before unregistering.

#### Scenario: Application deployment changes shell assets
- **WHEN** a developer reloads the dashboard after an application deployment
- **THEN** the browser obtains the current server-delivered shell without a prior service-worker cache

#### Scenario: Network is unavailable
- **WHEN** a client opens without network access
- **THEN** the browser does not serve a stale application-controlled shell cache
