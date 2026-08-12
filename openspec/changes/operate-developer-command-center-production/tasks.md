## 1. Verified Main Prerequisite

- [ ] 1.1 Verify PR #2 is merged, refresh `main`, and record the exact merge SHA; stop if the PR is open, the SHA is absent from current `main`, or required deployment files are missing.
- [ ] 1.2 Verify the merge SHA contains the reviewed `deploy-developer-command-center` change, the working tree is clean, and the operational evidence still names the intended Railway and GitHub resources.

## 2. Authorized Main Deployment and Readiness

- [ ] 2.1 After fresh explicit authorization, re-read the Railway service, `/data` volume, domain, single-replica runtime settings, and required variable names without exposing values; stop on drift.
- [ ] 2.2 Bind the existing Railway service source to `cubanx/dev-command-center` branch `main`, deploy the exact verified merge SHA, and record the resulting Railway deployment ID and terminal status.
- [ ] 2.3 Require `https://developer-command-center-production.up.railway.app/health` and `/ready` to return `200` before continuing; record status codes and stop on failure.

## 3. Bounded Application Verification

- [ ] 3.1 Verify one GitHub OAuth login, secure session, and installation-token bootstrap for the selected `cubanx/dev-command-center` repository.
- [ ] 3.2 Record one accepted signed GitHub delivery ID and outcome for each configured event family without recording payloads.
- [ ] 3.3 Verify signed Deployment and Deployment status deliveries update only the installation-scoped dashboard and emit one notification per terminal transition.

## 4. Persistence, Rollback, and Evidence

- [ ] 4.1 Restart the service once with the existing `/data` volume and verify delivery identifiers, projections, and `/ready` survive.
- [ ] 4.2 Rehearse or execute rollback to the last known-good application deployment without replacing the volume, restore the intended merge SHA, and record readiness after both transitions.
- [ ] 4.3 Complete the redacted evidence record with timestamp, exact merge SHA, deployment ID, configuration-name checklist, endpoint statuses, GitHub delivery IDs, OAuth/projection/durability outcomes, and rollback result; run strict OpenSpec validation.
