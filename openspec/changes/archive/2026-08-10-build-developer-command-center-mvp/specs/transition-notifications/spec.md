## ADDED Requirements

### Requirement: Useful transitions only
The system SHALL persist notifications only for review requests, failed checks, mergeability changes, verified deployment failure/success, and committed OpenSpec completion.

#### Scenario: Repeated unchanged event
- **WHEN** a webhook or reconciliation repeats state already projected
- **THEN** no new notification is created

#### Scenario: Untrusted Railway failure hint
- **WHEN** a Railway webhook claims a failed deployment but authoritative verification has not succeeded
- **THEN** no failure notification is created

### Requirement: User-scoped deduplication
Every notification SHALL belong to one developer and have a user-scoped transition key that prevents duplicate delivery.

#### Scenario: Same provider transition is processed twice
- **WHEN** two processing attempts produce the same user and transition key
- **THEN** only one notification row and live notification are created

### Requirement: Authenticated live updates
The system SHALL publish refresh and notification events only through an authenticated SSE stream scoped to the current developer.

#### Scenario: Projection changes for one developer
- **WHEN** a persisted transition affects one developer
- **THEN** only that developer's connected clients receive the live event

### Requirement: Permission-based browser notification
The PWA SHALL request notification permission only in response to a developer action and SHALL show browser notifications only while an authenticated client is connected in the MVP.

#### Scenario: Notification permission is denied
- **WHEN** the browser denies notification permission
- **THEN** the dashboard continues live visual updates without repeated permission prompts or errors
