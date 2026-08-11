## MODIFIED Requirements

### Requirement: Useful transitions only
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
