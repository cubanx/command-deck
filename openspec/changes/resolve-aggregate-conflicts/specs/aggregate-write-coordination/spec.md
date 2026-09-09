## Purpose

Preserve independent user projection updates during concurrent application writes while retaining database conflict detection and observable failures.

## ADDED Requirements

### Requirement: Same-user mutation coordination
Cooperating mutations within one application process and database instance SHALL execute serially per user and SHALL apply each mutation to freshly read state. Different users SHALL remain independently executable. Provider reads MUST NOT be held inside this serialization boundary.

#### Scenario: Four overlapping mutations
- **WHEN** four cooperating writes independently change the same user's aggregate
- **THEN** all four committed changes survive without exhaustion caused solely by those writers contending with each other

#### Scenario: Different users
- **WHEN** one user's write is pending and another user's write is ready
- **THEN** the second user's write can complete independently

### Requirement: Preserve external conflict protection
The system SHALL retain revision-checked writes, existing bounded retries, fresh reads on retry, size limits and missing-user errors. External writes MUST NOT be overwritten by a stale whole-document replacement. Callback replay and reported outcomes SHALL reflect the committed attempt; failed attempts MUST NOT trigger successful notifications.

#### Scenario: Another writer changes the revision
- **WHEN** an external writer commits between a read and replacement
- **THEN** the stale replacement fails its revision check and a permitted retry applies the mutation to freshly read state

#### Scenario: Retry limit is exhausted
- **WHEN** external revision conflicts exhaust the existing bounded attempts
- **THEN** the caller receives the classified failure and no successful outcome is fabricated

#### Scenario: Newer lifecycle evidence exists
- **WHEN** a delayed projection attempts to apply older lifecycle or progress evidence after a newer update
- **THEN** successful write coordination does not authorize regressing that newer evidence

### Requirement: Failure does not poison coordination
A failed mutation SHALL reject to its caller while releasing coordination for subsequent writes. Completed queue entries SHALL be reclaimed without disconnecting pending successors. Existing sanitized diagnostic behavior SHALL be preserved.

#### Scenario: Failed writer followed by valid writer
- **WHEN** a mutation fails validation or persistence and a valid successor is queued
- **THEN** the failure reaches its caller and the successor can run against fresh state
