# production-deployment Specification

## Purpose
TBD - created by archiving change replace-sqlite-with-mongodb. Update Purpose after archive.
## Requirements
### Requirement: Reproducible single-service runtime
The system SHALL provide a pinned, locked, non-root Bun container build and Railway configuration for exactly one application service and one process.

#### Scenario: Container build
- **WHEN** the production image is built from the repository root
- **THEN** dependencies are installed from the lockfile without mutation and the service starts with the repository's Bun entrypoint as a non-root user

#### Scenario: Process binding
- **WHEN** Railway supplies `PORT`
- **THEN** the HTTP server listens on that port and does not require a second service or sidecar

### Requirement: MongoDB storage readiness
The production service MUST connect to the configured MongoDB database and initialize its required indexes idempotently before it reports ready. It MUST NOT require a SQLite path or Railway filesystem volume.

#### Scenario: Valid MongoDB configuration
- **WHEN** `MONGODB_URI_BASE` and `MONGODB_DATABASE` identify an available MongoDB database
- **THEN** startup connects to that database, initializes required indexes, and readiness can pass

#### Scenario: Unavailable MongoDB configuration
- **WHEN** production configuration omits MongoDB settings or MongoDB cannot be reached or initialized
- **THEN** startup or readiness fails with a sanitized configuration or connection error before traffic is activated

#### Scenario: Restart durability
- **WHEN** a verified webhook delivery is persisted and the Railway service restarts with the same MongoDB database configured
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
- **THEN** its callback is `${PUBLIC_URL}/auth/github/callback`, webhook is `${PUBLIC_URL}/webhooks/github` with SSL verification, repository permissions are Metadata read (implicit), Pull requests read, Checks read, Actions read, Contents read, and Deployments read, with Issues read only for review-bot tracking; subscribed events are Installation, Pull request, Pull request review, Check run, Check suite, Workflow run, Push, Deployment, and Deployment status, with Issue comment only for review-bot tracking

#### Scenario: Repository API authentication
- **WHEN** the service bootstraps, repairs, reconciles, or fetches explicit repository details
- **THEN** it uses a short-lived installation token scoped to the installation and selected repositories rather than a PAT or OAuth user token

#### Scenario: Webhook receipt
- **WHEN** GitHub sends a delivery
- **THEN** the service verifies the raw-body signature, durably records the delivery ID, returns an acknowledgement promptly, and processes retries idempotently

### Requirement: Secret-safe production configuration
The service MUST validate every required production variable at startup and MUST NOT expose secret values to source control, clients, logs, or verification evidence.

#### Scenario: Missing or placeholder secret
- **WHEN** a required GitHub credential is absent, blank, malformed, or an obvious placeholder
- **THEN** startup fails with only the variable name and sanitized reason

#### Scenario: Required variables present
- **WHEN** production starts
- **THEN** it requires `NODE_ENV`, `PUBLIC_URL`, `MONGODB_URI_BASE`, `MONGODB_DATABASE`, `GITHUB_APP_ID`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_WEBHOOK_SECRET`, while Railway supplies `PORT` and `RAILWAY_PUBLIC_DOMAIN`

### Requirement: GitHub-native deployment boundary
Deployment visibility MUST come from the selected repositories through signed GitHub deliveries and installation-scoped API reads; the runtime MUST NOT require Railway API credentials, mappings, or webhook intake.

#### Scenario: Incremental deployment update
- **WHEN** GitHub sends a valid signed `deployment` or `deployment_status` delivery for a selected repository
- **THEN** the installation-scoped deployment projection is updated idempotently without querying Railway

#### Scenario: Bootstrap or repair
- **WHEN** an installation is first bound or explicitly repaired
- **THEN** the service uses a short-lived installation token for bounded deployment and latest-status reads and honors GitHub backoff and conditional-request metadata

#### Scenario: Railway hosting boundary
- **WHEN** production starts on Railway
- **THEN** it requires no Railway API token, connection mapping, or Railway webhook token and exposes no Railway webhook route

### Requirement: Health and readiness gates
The service SHALL expose separate liveness and readiness endpoints, and Railway activation MUST use readiness.

#### Scenario: Live process with unavailable database
- **WHEN** the HTTP process is running but MongoDB cannot be queried or required indexes cannot be initialized
- **THEN** `/health` returns `200` and `/ready` returns a non-`200` response with no sensitive diagnostic data

#### Scenario: Deployment activation
- **WHEN** Railway evaluates a new deployment
- **THEN** traffic is activated only after `/ready` returns `200` within the configured bounded timeout

### Requirement: Reversible evidence-gated rollout
Production execution MUST require explicit authorization, preserve both the MongoDB store and legacy SQLite store during rollback, and remain incomplete until bounded evidence is recorded.

#### Scenario: Provider mutation gate
- **WHEN** the next task would create or change Railway, GitHub, 1Password, or deployment state
- **THEN** work pauses for fresh task-scoped user authorization before that mutation

#### Scenario: Production verification evidence
- **WHEN** rollout verification is performed
- **THEN** evidence records the timestamp, exact Git SHA, Railway deployment ID, redacted configuration-name checklist, GitHub delivery IDs, endpoint statuses, OAuth result, projection result, restart durability result, and rollback result without secrets or payload bodies

#### Scenario: Rollback
- **WHEN** readiness or bounded verification fails
- **THEN** the operator restores the previous application revision and configuration without deleting or modifying either store and records the outcome

