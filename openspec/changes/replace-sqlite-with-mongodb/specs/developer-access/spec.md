## REMOVED Requirements

### Requirement: Operator-controlled Railway binding
The system MUST NOT let browser clients create Railway project, service, or environment mappings and SHALL treat a strictly validated server-side configuration keyed by immutable GitHub numeric user ID as the complete hosted mapping source for the MVP.

#### Scenario: Signed-in developer submits Railway identifiers
- **WHEN** a signed-in developer posts syntactically valid Railway resource identifiers
- **THEN** the service exposes no self-service binding route and persists no mapping

#### Scenario: Configured developer exists
- **WHEN** startup or successful GitHub login finds a configured immutable GitHub user ID already persisted as a developer
- **THEN** the service atomically replaces hosted mappings with exactly that operator-controlled configuration

#### Scenario: Configured developer has not signed in
- **WHEN** a configured immutable GitHub user ID has no persisted developer
- **THEN** the service creates no mapping until that GitHub identity signs in

#### Scenario: Local demo seeds Railway evidence
- **WHEN** the loopback-only local demo starts
- **THEN** it MAY create its deterministic fixture mapping without enabling client-created or hosted configured mappings

**Reason:** GitHub installation bindings are the only runtime authorization boundary; the application has no Railway runtime access or mapping store.

**Migration:** Discard Railway mapping configuration. Verified OAuth installation bindings and the narrow operator seed remain installation-bound and server-controlled.
