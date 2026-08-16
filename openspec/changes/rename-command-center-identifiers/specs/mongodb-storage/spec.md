## MODIFIED Requirements

### Requirement: MongoDB initialization and readiness
The application SHALL initialize the required MongoDB collections and indexes idempotently and SHALL report ready only after it can reach the configured database and verify the required storage initialization. Production SHALL use exactly `command-center-ai-production`; Railway environment databases SHALL use `command-center-ai-<environment>`; local databases SHALL use the `command-center-ai-local` family; and destructive tests SHALL use isolated `command-center-ai-test-*` databases. Startup and destructive-test guards SHALL fail closed when the configured database does not match the required environment-specific name. Production startup SHALL NOT require a SQLite path or persistent Railway filesystem volume.

#### Scenario: Ready MongoDB store
- **WHEN** the application can connect to MongoDB using the canonical database for its environment and all required indexes are present or created successfully
- **THEN** the readiness endpoint reports ready

#### Scenario: Unavailable or invalid MongoDB store
- **WHEN** MongoDB is unreachable, required storage initialization fails, or the configured database does not match the required environment-specific name
- **THEN** the readiness endpoint reports not ready
- **AND** the application does not claim production readiness

#### Scenario: Production database is exact
- **WHEN** the application starts in production
- **THEN** it accepts only `command-center-ai-production` as the configured MongoDB database

#### Scenario: Destructive test database is isolated
- **WHEN** a destructive MongoDB test is prepared
- **THEN** its database name starts with `command-center-ai-test-`
- **AND** the guard rejects every database outside that prefix
