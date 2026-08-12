# installable-pwa Specification

## Purpose
TBD - created by archiving change build-developer-command-center-mvp. Update Purpose after archive.
## Requirements
### Requirement: Installable application shell
The web app SHALL provide a manifest, application icons, standalone display metadata, theme colors, and a service worker sufficient for supported macOS browsers to install it.

#### Scenario: Browser evaluates installability
- **WHEN** the service is delivered over a secure origin with its manifest and service worker
- **THEN** the browser can offer the command center as an installable standalone web app

### Requirement: Safe shell caching
The service worker SHALL cache only versioned public shell assets and MUST NOT cache authenticated API responses, SSE data, OAuth callbacks, or webhook traffic.

#### Scenario: Network is unavailable
- **WHEN** an installed client opens without network access
- **THEN** the public shell may load but it clearly reports that live command-center data is unavailable
