## MODIFIED Requirements

### Requirement: Visible reconciliation failure
The system MUST preserve the last known evidence and expose stale/error state when reconciliation fails, including failure on any page of a paginated resource, rather than marking the resource verified or current. For each installation, it SHALL retain at most 20 user-scoped, sanitized reconciliation evidence records ordered by completion time. Each record MUST identify the completion time, success or failure outcome, operation category, and, when known, repository identity and provider status code; it MUST NOT retain provider payloads, request URLs, headers, tokens, raw error bodies, or stack traces.

#### Scenario: Repair request fails
- **WHEN** an authoritative provider read fails after bounded retries
- **THEN** the existing projection remains available with an explicit stale/error indicator and a sanitized failure evidence record is retained

#### Scenario: Paginated repair is incomplete
- **WHEN** an authoritative provider read obtains some pages but fails before reaching the final page
- **THEN** none of the partial result is applied as a complete snapshot, the prior projection remains available with an explicit stale/error indicator, and a sanitized failure evidence record is retained

#### Scenario: Repeated reconciliation attempts exceed retention
- **WHEN** an installation completes more than 20 reconciliation attempts
- **THEN** the system retains the 20 most recent evidence records and deterministically removes older records

#### Scenario: Reconciliation succeeds after a failure
- **WHEN** a previously stale installation reconciles successfully
- **THEN** the system clears its stale/error state and retains a successful evidence record without deleting earlier retained evidence

#### Scenario: Another user cannot access installation evidence
- **WHEN** an authenticated user does not own an installation's reconciliation projection
- **THEN** that user cannot receive its reconciliation evidence
