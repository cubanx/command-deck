## MODIFIED Requirements

### Requirement: Authenticated live updates
The system SHALL publish refresh and notification events only through an authenticated SSE stream scoped to the current developer. Each named refresh notification SHALL use actual line delimiters and a terminating blank line so native `EventSource` clients can dispatch it.

#### Scenario: Projection changes for one developer
- **WHEN** a persisted transition affects one developer
- **THEN** only that developer's connected clients receive the live event

#### Scenario: Refresh frame is dispatchable
- **WHEN** the authenticated stream announces a refresh
- **THEN** it emits an `event: refresh` SSE field and terminates the event with a blank line using actual line-feed delimiters rather than literal backslash escapes
