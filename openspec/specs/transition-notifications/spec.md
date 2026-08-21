# transition-notifications Specification

## Purpose
TBD - created by archiving change build-developer-command-center-mvp. Update Purpose after archive.

## Requirements

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

### Requirement: Useful GitHub transitions only
The system SHALL persist notifications only for review requests, failed checks, mergeability changes, signed GitHub deployment failure/success, and committed OpenSpec completion.

#### Scenario: Repeated unchanged event
- **WHEN** a webhook or reconciliation repeats state already projected
- **THEN** no new notification is created

#### Scenario: GitHub deployment reaches a terminal state
- **WHEN** a signed `deployment_status` event transitions an installation-scoped deployment into `success`, `failure`, or `error`
- **THEN** the system creates one user-scoped notification for developers bound to that installation

#### Scenario: Nonterminal deployment update
- **WHEN** a deployment status is queued, pending, or in progress
- **THEN** the projection updates without a terminal notification

### Requirement: Notification configuration is centralized
The existing developer-action permission request and authenticated browser notification behavior SHALL be configured from the shared configuration screen without expanding notification triggers or delivery behavior.

#### Scenario: Developer configures notifications
- **WHEN** the developer opens configuration and activates the notification permission control
- **THEN** the existing permission-based browser notification flow runs and denied permission preserves live visual updates
