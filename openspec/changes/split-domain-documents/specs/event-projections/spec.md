## MODIFIED Requirements

### Requirement: Recoverable inbox processing
The system SHALL retry pending accepted deliveries after process startup and SHALL clear raw payload bodies after successful processing while retaining delivery identity and outcome. Processing SHALL update shared domain documents independently and mark a receipt complete only after its required effects succeed. Repeated attempts SHALL be safe and older evidence SHALL NOT replace newer state; coordination across domain documents SHALL be limited to demonstrated dependencies.

#### Scenario: Process stops after acknowledgement
- **WHEN** the service restarts with a pending accepted delivery
- **THEN** the worker resumes it without requiring provider redelivery

#### Scenario: Processing stops after one required write
- **WHEN** a delivery requires multiple effects and processing stops between them
- **THEN** the receipt remains recoverable and retry completes the remaining effects without duplicating prior effects

#### Scenario: Receipt identity has expired
- **WHEN** an older event is accepted after receipt expiry
- **THEN** source ordering and idempotent domain updates still prevent rollback of newer state
