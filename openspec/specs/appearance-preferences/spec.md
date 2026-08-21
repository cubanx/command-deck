# appearance-preferences Specification

## Purpose
Lets each developer choose an accessible Command Deck color scheme without sending the preference to the server.

## Requirements

### Requirement: Browser-local appearance preference
The dashboard SHALL offer System, Light, and Dark appearance preferences as separate vertical menu choices only in the signed-in user's native avatar dropdown, SHALL mark the active choice with a checkmark, SHALL default to System, SHALL persist the selection browser-locally, and SHALL never upload it.

#### Scenario: System preference follows the browser
- **WHEN** the selected preference is System and the browser color scheme changes
- **THEN** the dashboard immediately applies the current browser color scheme

#### Scenario: Explicit preference overrides the browser
- **WHEN** the developer selects Dark or Light
- **THEN** the dashboard applies and restores that scheme across reloads regardless of the browser scheme

#### Scenario: Appearance is changed from the avatar menu
- **WHEN** the developer selects System, Light, or Dark in the avatar dropdown
- **THEN** the selected browser-local preference is applied and only its menu choice shows a checkmark

#### Scenario: Appearance selects the in-app mark
- **WHEN** the applied appearance is Light or Dark
- **THEN** the decorative in-app mark uses Signal for Light and Night Deck for Dark while the installed application icon remains stable

### Requirement: Accessible color schemes
Every appearance mode SHALL preserve the dashboard's existing semantic status distinctions, visible focus indicators, and readable contrast.

#### Scenario: Keyboard user changes appearance
- **WHEN** a keyboard user selects an appearance preference
- **THEN** the avatar disclosure and appearance control expose their labels, expanded or selected state, and predictable focus order, and the resulting dashboard retains visible focus and semantic status cues
