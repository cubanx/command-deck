## MODIFIED Requirements

### Requirement: Actionable terminal installation failure

The system SHALL continue to apply bounded retry only to retryable provider requests. After those retries are exhausted, reconciliation SHALL emit exactly one application error for each failed installation that identifies the installation, failed operation, provider status when available, and a sanitized diagnostic; it MUST NOT expose request URLs, headers, tokens, provider payloads, raw bodies, or stack traces. Reconciliation SHALL continue processing the remaining approved installations and SHALL preserve stale/error evidence for every terminal failure. Targeted reconciliation and unexpected setup, persistence, discovery, and bookkeeping failures SHALL also identify the relevant installation when known and the failing operation/category. A failure before installation discovery SHALL explicitly identify broad scope and unavailable installation identity. Each diagnostic SHALL be one serialized JSON line emitted to the runtime log stream, with safe locally selected fields; arbitrary exception names and messages MUST NOT be trusted diagnostic fields. Already-reported aggregate failures SHALL retain failed outcomes without duplicate application errors; unexpected unreported failures MUST NOT be silently suppressed. Separate failing operations SHALL remain separately observable.

#### Scenario: Retryable provider request recovers

- **WHEN** a retryable reconciliation request succeeds within the bounded provider-request attempts
- **THEN** the system records the successful reconciliation without emitting a terminal installation error

#### Scenario: Installation reconciliation exhausts provider retries

- **WHEN** an installation's provider request still fails after its bounded attempts
- **THEN** the system preserves prior projections, retains sanitized stale/error evidence, and emits one error containing the installation, operation, status when known, and sanitized diagnostic

#### Scenario: One installation fails while another succeeds

- **WHEN** a broad reconciliation encounters a terminal failure for one approved installation
- **THEN** the system continues serially through the other approved installations and reports the failed installation without duplicating its application error

#### Scenario: Targeted reconciliation fails outside the provider response path

- **WHEN** a target's setup, credential creation, or asynchronous persistence fails
- **THEN** one sanitized JSON diagnostic identifies that installation and failing operation/category, the outcome remains failed, and serialization releases so later targets can execute

#### Scenario: Bookkeeping fails after provider work

- **WHEN** reconciliation bookkeeping fails after provider work completes
- **THEN** a distinct sanitized diagnostic identifies the installation and bookkeeping operation without relogging an already-reported provider failure

#### Scenario: Unexpected broad discovery failure

- **WHEN** broad reconciliation fails before an installation can be identified and no inner boundary reported the failure
- **THEN** it emits one sanitized diagnostic with broad scope and unavailable installation identity and retains a failed outcome

#### Scenario: Expected or unchanged reconciliation outcome

- **WHEN** reconciliation returns an established expected outcome, closes a target successfully, or preserves an unchanged resource
- **THEN** no terminal application error is emitted and existing result semantics are preserved

#### Scenario: Hostile exception content reaches the log boundary

- **WHEN** an exception carries sensitive canaries or line breaks in its name, message, payload, or diagnostic fields
- **THEN** the runtime emits one parseable JSON line containing only approved context and none of that raw exception content

#### Scenario: Verify runtime transport and hosted receipt

- **WHEN** diagnostic acceptance is evaluated
- **THEN** repository tests verify real runtime stderr bytes rather than only in-memory logger arguments, and production acceptance additionally requires exact deployed-revision evidence and fresh hosted log receipt from a natural failure
