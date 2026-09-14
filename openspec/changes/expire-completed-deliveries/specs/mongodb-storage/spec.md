## ADDED Requirements

### Requirement: Completed webhook receipt retention

The system SHALL make inbox deliveries in `done` or `ignored` status eligible for asynchronous deletion 72 hours after their valid processing timestamp. Retention SHALL apply to existing and newly completed deliveries. Pending, pending-verification, and rejected deliveries SHALL NOT expire under this policy, regardless of their age or any processing timestamp. Completed records without a date-valued processing timestamp SHALL remain intact. Receipt expiry SHALL NOT delete user projections.

#### Scenario: Old completed receipts
- **WHEN** a done or ignored delivery was processed more than 72 hours ago
- **THEN** asynchronous database cleanup removes its receipt
- **AND** the same rule applies to receipts that predate activation of the policy

#### Scenario: Recently completed old delivery
- **WHEN** a delivery was received more than 72 hours ago but processed less than 72 hours ago
- **THEN** its receipt remains retained

#### Scenario: Recoverable or failed delivery
- **WHEN** a delivery is pending, pending-verification, or rejected
- **THEN** retention preserves it and its available payload and diagnostic fields even if its processing timestamp is older than 72 hours

#### Scenario: Completion timestamp absent or invalid
- **WHEN** a completed delivery has no processing timestamp or its timestamp is not a date
- **THEN** retention does not remove it

#### Scenario: Repeated storage initialization
- **WHEN** initialization runs again after the retention policy is installed
- **THEN** it succeeds and preserves the 72-hour policy, receipt uniqueness, and existing inbox ordering and retry indexes

## MODIFIED Requirements

### Requirement: Independent operational collections
The system SHALL keep hashed sessions, hashed OAuth states, global webhook inbox deliveries, provider response and ETag cache entries, and notifications outside the user aggregate. Each collection SHALL enforce the identity, expiry, uniqueness, or retry boundary required by its independent lifecycle. Webhook delivery-ID deduplication SHALL last for the lifetime of the retained receipt, including the completed-receipt retention window.

#### Scenario: Session and OAuth expiry
- **WHEN** a session or OAuth state reaches its expiry time
- **THEN** the system rejects it even if asynchronous database expiry cleanup has not yet removed its document

#### Scenario: Webhook delivery deduplication
- **WHEN** the same provider and delivery ID is received more than once while its receipt is retained
- **THEN** one inbox identity controls processing and retries
- **AND** the event is not projected twice

#### Scenario: Expired webhook receipt replay
- **WHEN** a valid delivery reuses a provider delivery ID whose completed receipt has been deleted by retention
- **THEN** intake accepts it as a new delivery subject to normal verification and processing

#### Scenario: Notification transition deduplication
- **WHEN** the same user-scoped transition is recorded more than once
- **THEN** the notification uniqueness boundary admits at most one durable notification for that transition
