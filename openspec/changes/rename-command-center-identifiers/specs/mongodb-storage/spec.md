## MODIFIED Requirements

### Requirement: MongoDB initialization and readiness
The application SHALL initialize the required MongoDB collections and indexes idempotently and SHALL report ready only after it can reach the configured database and verify the required storage initialization. Production and both Railway projects SHALL use exactly `command-center-ai-production`; every Railway deployment SHALL apply production secret, HTTPS-origin, and trusted-origin safeguards regardless of `NODE_ENV`; local databases SHALL use the `command-center-ai-local` family; and destructive tests SHALL use isolated `command-center-ai-test-*` databases. Startup and destructive-test guards SHALL fail closed when the configured database does not match the required hosted or isolated name. Production startup SHALL NOT require a SQLite path or persistent Railway filesystem volume.

#### Scenario: Ready MongoDB store
- **WHEN** the application can connect to MongoDB using the canonical database for its environment and all required indexes are present or created successfully
- **THEN** the readiness endpoint reports ready

#### Scenario: Unavailable or invalid MongoDB store
- **WHEN** MongoDB is unreachable, required storage initialization fails, or the configured database does not match the required environment-specific name
- **THEN** the readiness endpoint reports not ready
- **AND** the application does not claim production readiness

#### Scenario: Hosted database is exact
- **WHEN** the application starts in production or in either Railway project
- **THEN** it accepts only `command-center-ai-production` as the configured MongoDB database
- **AND** it applies production configuration and origin validation

#### Scenario: Destructive test database is isolated
- **WHEN** a destructive MongoDB test is prepared
- **THEN** its database name starts with `command-center-ai-test-`
- **AND** the guard rejects every database outside that prefix
