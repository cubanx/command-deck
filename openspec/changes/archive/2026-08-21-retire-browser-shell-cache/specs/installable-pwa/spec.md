## MODIFIED Requirements

### Requirement: Installable application shell
The web app SHALL provide a manifest, application icons, standalone display metadata, and theme colors so supported macOS browsers can expose it as a standalone web app. The application SHALL NOT register a service worker for its normal browser shell.

#### Scenario: Browser evaluates installability
- **WHEN** the service is delivered over a secure origin with its manifest and icons
- **THEN** the browser receives the metadata required to present Command Deck.ai as a standalone web app where supported

#### Scenario: Developer inspects icon provenance
- **WHEN** the repository distributes the adapted application artwork
- **THEN** it identifies OpenMoji, the original author and source, the modifications, and CC BY-SA 4.0 terms

#### Scenario: Browser applies an adaptive favicon
- **WHEN** a browser supports color-scheme media queries in SVG favicons
- **THEN** it shows Signal for light appearance and Night Deck for dark appearance while unsupported browsers retain the stable Night Deck fallback

#### Scenario: Browser loads the command center
- **WHEN** the service is delivered over a secure origin
- **THEN** the browser requests the current HTML, CSS, and JavaScript without service-worker cache interception

#### Scenario: Prior shell worker is updated
- **WHEN** a browser with a previously registered command-center service worker fetches `/sw.js`
- **THEN** the cleanup worker skips waiting, clears all Cache Storage entries during activation, unregisters, and refreshes its controlled clients without registering a replacement

### Requirement: Safe shell delivery
The application SHALL NOT cache browser-shell or runtime responses through a service worker. During retirement of a previously installed worker, the service SHALL provide a non-cached cleanup worker that clears Cache Storage, unregisters, and refreshes its controlled clients. The service SHALL deliver the HTML shell and its JavaScript and CSS with response directives that require fresh retrieval on ordinary reloads. The application MUST NOT alter authenticated API responses, SSE data, OAuth callbacks, webhook traffic, or notification behavior.

#### Scenario: Existing client retires cached shell
- **WHEN** a client controlled by a previously installed application worker loads the cleanup worker
- **THEN** the worker clears Cache Storage, unregisters itself, and refreshes the controlled client without intercepting application requests

#### Scenario: Ordinary reload receives current shell
- **WHEN** a user reloads the application after a shell update
- **THEN** the browser revalidates the HTML, JavaScript, and CSS shell responses rather than using an application-managed cached copy
