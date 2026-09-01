## ADDED Requirements

### Requirement: Expected signed-out snapshot load

The dashboard SHALL make one snapshot request per load. A `401` response SHALL render the signed-out state without a client retry or application-error log; any other failed response or request failure SHALL retain the existing sanitized error classification and visible recovery state.

#### Scenario: Snapshot request is unauthenticated

- **WHEN** the dashboard's snapshot request returns `401`
- **THEN** the dashboard renders its signed-out state without retrying the request or logging an application error

#### Scenario: Snapshot request fails for another reason

- **WHEN** the snapshot request fails or returns a non-success status other than `401`
- **THEN** the dashboard logs only sanitized failure context and renders its existing recovery state without exposing response content
