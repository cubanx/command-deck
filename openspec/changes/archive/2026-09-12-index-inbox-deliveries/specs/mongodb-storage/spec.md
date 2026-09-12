## ADDED Requirements

### Requirement: Index-supported inbox ordering

Storage initialization SHALL idempotently provide an index that can supply ascending received-time ordering for eligible pending and pending-verification inbox deliveries while retaining the existing retry-selection index.

#### Scenario: Eligible inbox selection
- **WHEN** the inbox selects pending or pending-verification deliveries whose retry time is absent or due
- **THEN** an index-ordered query plan is available without a blocking sort
- **AND** deliveries remain ordered by ascending received time
- **AND** future retries and terminal deliveries remain excluded

#### Scenario: Repeated initialization
- **WHEN** storage initialization runs with the required inbox indexes already present
- **THEN** it succeeds without duplicating or removing those indexes
