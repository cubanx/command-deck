## 1. Production Configuration Tests

- [x] 1.1 Add failing tests for required production variables, placeholder rejection, HTTPS `PUBLIC_URL`, Railway domain agreement, and secure-cookie configuration.
- [x] 1.2 Add failing tests for durable SQLite path containment under `RAILWAY_VOLUME_MOUNT_PATH` and rejection of missing, in-memory, relative, or escaping production paths.
- [x] 1.3 Add failing tests for strict, unique, server-only `RAILWAY_CONNECTIONS_JSON` mappings and sanitized configuration failures. Superseded by the GitHub-only deployment-source decision in group 4.
- [x] 1.4 Add failing tests for production forwarded-origin validation and database-backed readiness failure.

## 2. Repository Runtime Configuration

- [x] 2.1 Implement the minimum production configuration validation needed to pass group 1 without weakening local demo mode.
- [x] 2.2 Derive the GitHub OAuth callback from `PUBLIC_URL`, require matching trusted Railway proxy origin, and keep production cookies secure.
- [x] 2.3 Ensure `/ready` fails safely when SQLite is unavailable while `/health` remains a liveness check.
- [x] 2.4 Add a pinned, locked, non-root Bun `Dockerfile`, `.dockerignore`, and minimal `railway.json` using `/ready` as the activation healthcheck.

## 3. Operator Contract and Local Verification

- [x] 3.1 Document the exact Railway service, `/data` volume, database path, public domain, environment-variable names, health/readiness, and single-replica constraints.
- [x] 3.2 Document the personal GitHub App URLs, least permissions/events, selected-repository installation, installation-token boundary, webhook acknowledgement/deduplication, and rate-limit/backoff/ETag behavior.
- [x] 3.3 Document Railway connection mappings and hint reconciliation. Superseded by the GitHub-only deployment-source decision in group 4.
- [x] 3.4 Run focused tests, full tests, typecheck, container/config static checks, `git diff --check`, and strict OpenSpec validation for the original hosting implementation.

## 4. GitHub-Only Deployment Source

- [x] 4.1 Add failing tests for GitHub `deployment` and `deployment_status` projection, terminal-transition deduplication, installation isolation, bounded bootstrap/repair reads, and additive legacy-database compatibility.
- [x] 4.2 Remove runtime Railway credentials, connection mappings, webhook intake, reconciliation, access binding, and the unused Railway client while retaining Railway hosting validation.
- [x] 4.3 Implement additive GitHub-native deployment storage, signed webhook projections, installation-scoped dashboard reads, terminal notifications, and bounded conditional installation-token bootstrap/repair.
- [x] 4.4 Update local demo data, environment examples, README, and operator evidence to describe GitHub deployment visibility and the intentional absence of runtime Railway access.
- [x] 4.5 Run focused tests, full tests, typecheck, `git diff --check`, and strict OpenSpec validation.

## 5. Authorized Railway Hosting and Secret Setup

- [x] 5.1 After fresh explicit authorization, create or select the one Railway service from current `main`, attach one volume at `/data`, generate the public domain, set one replica, and record redacted resource identifiers.
- [ ] 5.2 After fresh explicit authorization, verify approved 1Password credential metadata and project only the required GitHub and hosting variables into Railway without exposing resolved values.
- [ ] 5.3 Configure Railway build/start behavior, `/ready` healthcheck, bounded timeout, and deployment drain/restart policy; record a redacted settings export or screenshots.

## 6. Authorized Personal GitHub App Setup

- [x] 6.1 After fresh explicit authorization, create the private personal `cubanx` GitHub App with the documented homepage, callback, webhook URL, SSL verification, initial permissions, and events.
- [x] 6.2 After fresh explicit authorization, add Deployments read plus Deployment and Deployment status events and record the reviewed App configuration without secrets.
- [ ] 6.3 Install the App only on the selected repositories and record the App and installation identifiers plus the permission/event review without secrets.

## 7. Authorized Deployment and Bounded Production Verification

- [ ] 7.1 After fresh explicit authorization, deploy the exact reviewed Git SHA and record its Railway deployment ID; require `/health` and `/ready` to return `200` before continuing.
- [ ] 7.2 Verify one OAuth login and secure session, one selected-repository bootstrap, and one accepted GitHub delivery per configured event family; record delivery IDs and outcomes only.
- [ ] 7.3 Verify signed GitHub Deployment and Deployment status deliveries update the installation-scoped dashboard and emit only deduplicated terminal transitions.
- [ ] 7.4 Restart the service once and verify the delivery inbox and projections survive on the attached volume.
- [ ] 7.5 Rehearse or execute rollback to the last known-good deployment without replacing the volume, restore the intended deployment, and record readiness outcomes.
- [ ] 7.6 Complete the redacted production evidence record with timestamp, exact Git SHA, deployment ID, configuration-name checklist, endpoint statuses, GitHub delivery IDs, OAuth/projection/durability results, and rollback result.
