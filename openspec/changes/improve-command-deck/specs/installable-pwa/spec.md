## MODIFIED Requirements

### Requirement: Installable application shell
The web app SHALL provide a manifest, an adaptive SVG favicon that uses Signal in light mode and Night Deck in dark mode, a stable Night Deck 32 pixel PNG fallback, a Night Deck PNG Apple touch icon, 192 and 512 pixel Night Deck application icons, a separately declared maskable icon, standalone display metadata, theme colors, and a service worker sufficient for supported macOS browsers to install it. Adapted third-party artwork SHALL retain its source, creator, modification, and license provenance.

#### Scenario: Browser evaluates installability
- **WHEN** the service is delivered over a secure origin with its manifest and service worker
- **THEN** Chromium can install the command center with `any` and `maskable` PNG icons and Safari can use the high-resolution manifest or Apple touch icon

#### Scenario: Developer inspects icon provenance
- **WHEN** the repository distributes the adapted application artwork
- **THEN** it identifies OpenMoji, the original author and source, the modifications, and CC BY-SA 4.0 terms

#### Scenario: Browser applies an adaptive favicon
- **WHEN** a browser supports color-scheme media queries in SVG favicons
- **THEN** it shows Signal for light appearance and Night Deck for dark appearance while unsupported browsers retain the stable Night Deck fallback
