## ADDED Requirements

### Requirement: Reproducible single-service runtime
The system SHALL provide a pinned, locked, non-root Bun container build and Railway configuration for exactly one application service and one process.

#### Scenario: Container build
- **WHEN** the production image is built from the repository root
- **THEN** dependencies are installed from the lockfile without mutation and the service starts with the repository's Bun entrypoint as a non-root user

#### Scenario: Process binding
- **WHEN** Railway supplies `PORT`
- **THEN** the HTTP server listens on that port and does not require a second service or sidecar

### Requirement: Durable SQLite storage
The production service MUST store the SQLite database and its sidecar files inside the attached Railway volume and MUST fail closed when durable storage cannot be established.

#### Scenario: Valid volume configuration
- **WHEN** `RAILWAY_VOLUME_MOUNT_PATH=/data` and `DATABASE_PATH=/data/command-center.sqlite`
- **THEN** startup opens the database at that path and readiness can pass

#### Scenario: Ephemeral production path
- **WHEN** production configuration uses an in-memory database, omits the volume mount, or places `DATABASE_PATH` outside the mount path
- **THEN** startup fails with a sanitized configuration error before serving traffic

#### Scenario: Restart durability
- **WHEN** a verified webhook delivery is persisted and the Railway service restarts on the same volume
- **THEN** the delivery and resulting projection remain queryable after readiness recovers

### Requirement: Canonical public URL
The production service MUST use one configured HTTPS origin for OAuth redirects and secure session behavior and MUST reject malformed or inconsistent public-origin configuration.

#### Scenario: Valid production origin
- **WHEN** `PUBLIC_URL` is an HTTPS origin with no credentials, path, query, or fragment and matches the Railway public domain
- **THEN** the OAuth callback is exactly `${PUBLIC_URL}/auth/github/callback` and session cookies are secure

#### Scenario: Inconsistent forwarded origin
- **WHEN** a production OAuth request presents forwarded scheme or host values that do not match `PUBLIC_URL`
- **THEN** the service rejects the request without issuing an OAuth state or session cookie

### Requirement: Least-privilege personal GitHub App
The operator contract MUST define a private personal GitHub App with only the permissions, events, URLs, and selected-repository installation required by the command center.

#### Scenario: GitHub App configuration review
- **WHEN** the App is prepared for production
- **THEN** its callback is `${PUBLIC_URL}/auth/github/callback`, webhook is `${PUBLIC_URL}/webhooks/github` with SSL verification, repository permissions are Metadata read (implicit), Pull requests read, Checks read, Actions read, and Contents read, with Issues read only for review-bot tracking; subscribed events are Installation, Pull request, Pull request review, Check run, Check suite, Workflow run, and Push, with Issue comment only for review-bot tracking

#### Scenario: Repository API authentication
- **WHEN** the service bootstraps, repairs, reconciles, or fetches explicit repository details
- **THEN** it uses a short-lived installation token scoped to the installation and selected repositories rather than a PAT or OAuth user token

#### Scenario: Webhook receipt
- **WHEN** GitHub sends a delivery
- **THEN** the service verifies the raw-body signature, durably records the delivery ID, returns an acknowledgement promptly, and processes retries idempotently

### Requirement: Secret-safe production configuration
The service MUST validate every required production variable at startup and MUST NOT expose secret values to source control, clients, logs, or verification evidence.

#### Scenario: Missing or placeholder secret
- **WHEN** a required GitHub or Railway credential is absent, blank, malformed, or an obvious placeholder
- **THEN** startup fails with only the variable name and sanitized reason

#### Scenario: Required variables present
- **WHEN** production starts
- **THEN** it requires `NODE_ENV`, `PUBLIC_URL`, `DATABASE_PATH`, `GITHUB_APP_ID`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`, `RAILWAY_API_TOKEN`, and `RAILWAY_CONNECTIONS_JSON`, while Railway supplies `PORT`, `RAILWAY_PUBLIC_DOMAIN`, and `RAILWAY_VOLUME_MOUNT_PATH`

### Requirement: Trusted Railway reconciliation boundary
Railway connection mappings MUST remain server-side, strictly validated, and authoritative only after targeted provider reconciliation.

#### Scenario: Valid connection mapping
- **WHEN** `RAILWAY_CONNECTIONS_JSON` is loaded
- **THEN** every mapping has exactly `githubUserId`, `projectId`, `serviceId`, and `environmentId`, non-empty provider IDs, and no duplicate full mapping identity; the one server-side `RAILWAY_WEBHOOK_TOKEN` is the intake filter

#### Scenario: Railway webhook hint
- **WHEN** a token-authenticated Railway webhook is accepted
- **THEN** the payload is treated only as a hint and no consequential deployment state is published until a targeted Railway API read succeeds

#### Scenario: GitHub API budget
- **WHEN** GitHub bootstrap or reconciliation indicates a rate limit, retry delay, or unchanged resource
- **THEN** it honors GitHub backoff and conditional-request metadata rather than polling aggressively

### Requirement: Health and readiness gates
The service SHALL expose separate liveness and readiness endpoints, and Railway activation MUST use readiness.

#### Scenario: Live process with unavailable database
- **WHEN** the HTTP process is running but the SQLite database cannot be queried
- **THEN** `/health` returns `200` and `/ready` returns a non-`200` response with no sensitive diagnostic data

#### Scenario: Deployment activation
- **WHEN** Railway evaluates a new deployment
- **THEN** traffic is activated only after `/ready` returns `200` within the configured bounded timeout

### Requirement: Reversible evidence-gated rollout
Production execution MUST require explicit authorization, preserve the persistent volume during rollback, and remain incomplete until bounded evidence is recorded.

#### Scenario: Provider mutation gate
- **WHEN** the next task would create or change Railway, GitHub, or 1Password state or deploy code
- **THEN** work pauses for fresh task-scoped user authorization before that mutation

#### Scenario: Production verification evidence
- **WHEN** rollout verification is performed
- **THEN** evidence records the timestamp, exact Git SHA, Railway deployment ID, redacted configuration-name checklist, GitHub delivery IDs, endpoint statuses, OAuth result, reconciliation result, restart durability result, and rollback result without secrets or payload bodies

#### Scenario: Rollback
- **WHEN** readiness or bounded verification fails
- **THEN** the operator restores the last known-good deployment without deleting or recreating the volume and records the outcome
