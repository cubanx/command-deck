## MODIFIED Requirements

### Requirement: Authenticated live updates
The system SHALL publish refresh events only through an authenticated SSE stream scoped to the current developer. Each named refresh event SHALL use actual line delimiters and a terminating blank line so native `EventSource` clients can dispatch it.

#### Scenario: Projection changes for one developer
- **WHEN** a persisted transition affects one developer
- **THEN** only connected clients currently authorized for the affected installation receive the live event

#### Scenario: Refresh frame is dispatchable
- **WHEN** the authenticated stream announces a refresh
- **THEN** it emits an `event: refresh` SSE field and terminates the event with a blank line using actual line-feed delimiters rather than literal backslash escapes

## REMOVED Requirements

### Requirement: User-scoped deduplication
**Reason**: Browser notifications are deferred; PR cards provide the current product behavior.
**Migration**: Remove producers, persistence, snapshot notification reads, permission controls, and popup delivery; retain authenticated card refresh.

### Requirement: Permission-based browser notification
**Reason**: Browser notifications are deferred; PR cards provide the current product behavior.
**Migration**: Remove producers, persistence, snapshot notification reads, permission controls, and popup delivery; retain authenticated card refresh.

### Requirement: Useful GitHub transitions only
**Reason**: Browser notifications are deferred; PR cards provide the current product behavior.
**Migration**: Remove producers, persistence, snapshot notification reads, permission controls, and popup delivery; retain authenticated card refresh.

### Requirement: Notification configuration is centralized
**Reason**: Browser notifications are deferred; PR cards provide the current product behavior.
**Migration**: Remove producers, persistence, snapshot notification reads, permission controls, and popup delivery; retain authenticated card refresh.
