## 1. Production Configuration Tests

- [x] 1.1 Add failing tests for required production variables, placeholder rejection, HTTPS `PUBLIC_URL`, Railway domain agreement, and secure-cookie configuration.
- [x] 1.2 Add failing tests for durable SQLite path containment under `RAILWAY_VOLUME_MOUNT_PATH` and rejection of missing, in-memory, relative, or escaping production paths.
- [x] 1.3 Add failing tests for strict, unique, server-only `RAILWAY_CONNECTIONS_JSON` mappings and sanitized configuration failures.
- [x] 1.4 Add failing tests for production forwarded-origin validation and database-backed readiness failure.

## 2. Repository Runtime Configuration

- [x] 2.1 Implement the minimum production configuration validation needed to pass group 1 without weakening local demo mode.
- [x] 2.2 Derive the GitHub OAuth callback from `PUBLIC_URL`, require matching trusted Railway proxy origin, and keep production cookies secure.
- [x] 2.3 Ensure `/ready` fails safely when SQLite is unavailable while `/health` remains a liveness check.
- [x] 2.4 Add a pinned, locked, non-root Bun `Dockerfile`, `.dockerignore`, and minimal `railway.json` using `/ready` as the activation healthcheck.

## 3. Operator Contract and Local Verification

- [x] 3.1 Document the exact Railway service, `/data` volume, database path, public domain, environment-variable names, health/readiness, and single-replica constraints.
- [x] 3.2 Document the personal GitHub App URLs, least permissions/events, selected-repository installation, installation-token boundary, webhook acknowledgement/deduplication, and rate-limit/backoff/ETag behavior.
- [x] 3.3 Document server-side Railway connection mappings, untrusted-hint reconciliation, secret-handling rules, rollout sequence, rollback, and redacted evidence template.
- [x] 3.4 Run focused tests, full tests, typecheck, container/config static checks, `git diff --check`, and `openspec validate deploy-developer-command-center --strict`.

## 4. Authorized Railway and Secret Setup

- [ ] 4.1 After fresh explicit authorization, create or select the one Railway service from current `main`, attach one volume at `/data`, generate the public domain, set one replica, and record redacted resource identifiers.
- [ ] 4.2 After fresh explicit authorization, verify approved 1Password credential metadata and project only the required server variables into Railway without exposing resolved values.
- [ ] 4.3 Configure Railway build/start behavior, `/ready` healthcheck, bounded timeout, and deployment drain/restart policy; record a redacted settings export or screenshots.

## 5. Authorized Personal GitHub App Setup

- [ ] 5.1 After fresh explicit authorization, create or update the private personal `cubanx` GitHub App with the documented homepage, callback, webhook URL, SSL verification, permissions, and events.
- [ ] 5.2 Install the App only on the selected repositories and record the App and installation identifiers plus the permission/event review without secrets.
- [ ] 5.3 Configure the matching server-side Railway connection mappings and global webhook token through approved secret sources without copying values into task evidence.

## 6. Authorized Deployment and Bounded Production Verification

- [ ] 6.1 After fresh explicit authorization, deploy the exact reviewed Git SHA and record its Railway deployment ID; require `/health` and `/ready` to return `200` before continuing.
- [ ] 6.2 Verify one OAuth login and secure session, one selected-repository bootstrap, and one accepted GitHub delivery per configured event family; record delivery IDs and outcomes only.
- [ ] 6.3 Verify one Railway webhook hint cannot publish authoritative state until targeted reconciliation succeeds.
- [ ] 6.4 Restart the service once and verify the delivery inbox and projections survive on the attached volume.
- [ ] 6.5 Rehearse or execute rollback to the last known-good deployment without replacing the volume, restore the intended deployment, and record readiness outcomes.
- [ ] 6.6 Complete the redacted production evidence record with timestamp, exact Git SHA, deployment ID, configuration-name checklist, endpoint statuses, provider delivery IDs, OAuth/reconciliation/durability results, and rollback result.
