## MODIFIED Requirements

### Requirement: Reproducible single-service runtime
The system SHALL provide a pinned, locked Bun container build and Railway configuration for exactly one application service and one application process. Any privileged volume initialization MUST be bounded to the declared `/data` mount, MUST refuse ambiguous existing-volume ownership, and MUST permanently drop to the non-root `bun` user before starting the application.

#### Scenario: Container build
- **WHEN** the production image is built from the repository root
- **THEN** dependencies are installed from the lockfile without mutation and the service starts the repository's Bun entrypoint as the non-root `bun` user

#### Scenario: Railway volume initialization
- **WHEN** Railway starts the container with the explicitly configured root bootstrap required for a newly attached root-mounted `/data` volume
- **THEN** the bootstrap initializes only that empty mount and execs the application as `bun`

#### Scenario: Ambiguous existing volume
- **WHEN** the mounted volume contains content that is not owned by `bun`
- **THEN** startup fails before changing that content or starting the application

#### Scenario: Process binding
- **WHEN** Railway supplies `PORT`
- **THEN** the HTTP server listens on that port and does not require a second service or sidecar

### Requirement: Durable SQLite storage
The production service MUST store the SQLite database and its sidecar files inside the attached Railway volume, MUST permit the non-root application process to create those files on an explicitly initialized empty volume, and MUST fail closed when durable storage cannot be established without an unapproved ownership repair.

#### Scenario: Fresh volume configuration
- **WHEN** `RAILWAY_VOLUME_MOUNT_PATH=/data`, `DATABASE_PATH=/data/command-center.sqlite`, the mount is empty, and the bounded volume initializer is explicitly enabled
- **THEN** startup initializes the mount for `bun`, opens the database at that path as `bun`, and readiness can pass

#### Scenario: Reused initialized volume
- **WHEN** the service restarts with a `/data` volume whose database and mount remain owned by `bun`
- **THEN** startup does not require an ownership repair and readiness can pass as `bun`

#### Scenario: Existing incompatible volume
- **WHEN** `/data` contains a database or other content not owned by `bun`
- **THEN** startup fails without recursively changing ownership, deleting, replacing, or recreating volume content

#### Scenario: Ephemeral production path
- **WHEN** production configuration uses an in-memory database, omits the volume mount, or places `DATABASE_PATH` outside the mount path
- **THEN** startup fails with a sanitized configuration error before serving traffic

#### Scenario: Restart durability
- **WHEN** a verified webhook delivery is persisted and the Railway service restarts on the same initialized volume
- **THEN** the delivery and resulting projection remain queryable after readiness recovers
