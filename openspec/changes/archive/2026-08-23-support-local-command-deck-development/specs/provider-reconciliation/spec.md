## ADDED Requirements

### Requirement: Bounded provider request execution
The system SHALL apply one fixed upper bound to every server-side GitHub request. On timeout, it SHALL expose a sanitized diagnostic identifying the request method and URL, preserve prior projections with visible stale/error state, and release reconciliation serialization so a later attempt can run.

#### Scenario: Provider request times out
- **WHEN** a server-side GitHub request exceeds the fixed upper bound
- **THEN** the request fails with a sanitized method and URL diagnostic, and existing projections remain available as stale/error state

#### Scenario: Reconciliation recovers after timeout
- **WHEN** a serialized reconciliation fails because a GitHub request times out
- **THEN** a subsequent reconciliation attempt is accepted and can complete using the existing retry behavior
