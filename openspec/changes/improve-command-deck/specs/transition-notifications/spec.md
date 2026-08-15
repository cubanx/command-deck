## ADDED Requirements

### Requirement: Notification configuration is centralized
The existing developer-action permission request and authenticated browser notification behavior SHALL be configured from the shared configuration screen without expanding notification triggers or delivery behavior.

#### Scenario: Developer configures notifications
- **WHEN** the developer opens configuration and activates the notification permission control
- **THEN** the existing permission-based browser notification flow runs and denied permission preserves live visual updates
