## ADDED Requirements

### Requirement: Evidence-backed final-SHA task absence

The system SHALL read pushed OpenSpec task content from the webhook's final commit SHA. A missing task path SHALL be treated as an expected stale artifact only when a bounded GitHub read positively proves that the exact path is absent from a complete final-SHA tree; that outcome MUST preserve prior task evidence and MUST NOT synthesize a deletion. An ambiguous `404`, incomplete absence evidence, or any other provider failure SHALL remain a sanitized projection error subject to durable inbox retry.

#### Scenario: Intermediate task path is absent from the final tree

- **WHEN** a push reports a non-removed task path that returns `404` at the final SHA and a complete final-SHA tree proves the exact path is absent
- **THEN** the system leaves prior evidence for that path unchanged, continues the push projection, and does not report an application error or deletion

#### Scenario: Missing path cannot be proven stale

- **WHEN** a pushed task fetch returns `404` but the final-SHA absence check fails, is incomplete, or still contains the path
- **THEN** the system fails the projection with a sanitized GitHub diagnostic and retains the accepted delivery for bounded retry

#### Scenario: Explicitly removed task path

- **WHEN** the signed push payload explicitly classifies a task path as removed
- **THEN** the system removes that task evidence without requiring a final-SHA content fetch
