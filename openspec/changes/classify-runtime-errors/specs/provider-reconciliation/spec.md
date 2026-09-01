## ADDED Requirements

### Requirement: Actionable terminal installation failure

The system SHALL continue to apply bounded retry only to retryable provider requests. After those retries are exhausted, reconciliation SHALL emit exactly one application error for each failed installation that identifies the installation, failed operation, provider status when available, and a sanitized diagnostic; it MUST NOT expose request URLs, headers, tokens, provider payloads, raw bodies, or stack traces. Reconciliation SHALL continue processing the remaining approved installations and SHALL preserve stale/error evidence for every terminal failure.

#### Scenario: Retryable provider request recovers

- **WHEN** a retryable reconciliation request succeeds within the bounded provider-request attempts
- **THEN** the system records the successful reconciliation without emitting a terminal installation error

#### Scenario: Installation reconciliation exhausts provider retries

- **WHEN** an installation's provider request still fails after its bounded attempts
- **THEN** the system preserves prior projections, retains sanitized stale/error evidence, and emits one error containing the installation, operation, status when known, and sanitized diagnostic

#### Scenario: One installation fails while another succeeds

- **WHEN** a broad reconciliation encounters a terminal failure for one approved installation
- **THEN** the system continues serially through the other approved installations and reports the failed installation without duplicating its application error
