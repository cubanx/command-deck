## MODIFIED Requirements

### Requirement: Reproducible single-service runtime
The system SHALL provide a pinned, locked Bun container build and Railway configuration for exactly one application service and one application process. Container startup MUST use root only for bounded validation and ownership initialization of the declared `/data` mount, MUST NOT depend on a Railway runtime-UID override, and MUST permanently drop to the stable non-root `bun` identity before starting the application.

#### Scenario: Container build
- **WHEN** the production image is built from the repository root
- **THEN** dependencies are installed from the lockfile without mutation, the entrypoint starts with only the privilege required to initialize the runtime mount, and the Bun application process runs as UID/GID 1000

#### Scenario: Railway volume initialization
- **WHEN** Railway starts the container with `RAILWAY_VOLUME_MOUNT_PATH=/data`, `DATABASE_PATH=/data/command-center.sqlite`, a root-owned `/data` mount, and the expected stable `bun` identity
- **THEN** startup repairs only the `/data` directory ownership when required and execs the application as `bun` without `RAILWAY_RUN_UID=0`

#### Scenario: Invalid or unrepairable volume
- **WHEN** the mount path, database path, `bun` identity, or ability to repair the `/data` directory ownership does not match the declared runtime contract
- **THEN** startup fails with a sanitized diagnostic before starting the application or changing volume contents

#### Scenario: Process binding
- **WHEN** Railway supplies `PORT`
- **THEN** the HTTP server listens on that port and does not require a second service or sidecar

### Requirement: Durable SQLite storage
The production service MUST store the SQLite database and its sidecar files inside the attached Railway volume, MUST permit the non-root application process to create and use those files after bounded mount-root initialization, and MUST NOT recursively change, delete, overwrite, or recreate existing volume contents during initialization.

#### Scenario: Fresh root-owned volume
- **WHEN** the declared `/data` volume is mounted with a root-owned mount directory and no database contents
- **THEN** startup repairs only the mount directory, opens `/data/command-center.sqlite` as `bun`, creates SQLite sidecar files there, and readiness can pass

#### Scenario: Reused initialized volume
- **WHEN** the service restarts with the declared `/data` volume and existing database contents remain accessible to `bun`
- **THEN** startup preserves those contents, runs the application as `bun`, and readiness can pass without recursive ownership changes

#### Scenario: Unrepairable mount root
- **WHEN** the declared `/data` directory cannot be assigned to UID/GID 1000
- **THEN** startup fails before opening SQLite and leaves all database and unrelated volume contents unchanged

#### Scenario: Ephemeral production path
- **WHEN** production configuration uses an in-memory database, omits the volume mount, or places `DATABASE_PATH` outside the exact declared database path
- **THEN** startup fails with a sanitized configuration error before serving traffic

#### Scenario: Restart durability
- **WHEN** a verified webhook delivery is persisted and the Railway service restarts on the same initialized volume
- **THEN** the delivery and resulting projection remain queryable after readiness recovers
