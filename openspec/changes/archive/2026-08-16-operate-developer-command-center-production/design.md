## Context

PR #2 contains the deploy-ready application and predeployment Railway, 1Password, and GitHub App setup. Its head is not production authority: rollout starts only after the PR is merged and the exact merge SHA is verified on current `main`.

The target is the existing single Railway service with one `/data` volume and the personal `Command Deck.ai` installation restricted to `cubanx/dev-command-center`. GitHub webhooks remain the incremental source; Railway is hosting-only.

## Goals / Non-Goals

**Goals:**

- Deploy exactly the verified PR #2 merge SHA from current `main`.
- Fail closed before deployment if ancestry, configuration names, volume attachment, domain, or GitHub App scope drifted.
- Gate activation on `/health` and database-backed `/ready`.
- Produce bounded OAuth, bootstrap, webhook, durability, rollback, and redacted evidence.

**Non-Goals:**

- Deploying a feature-branch SHA, enabling automatic deploys before merge, or widening GitHub repository access.
- Adding Railway runtime API access, additional services, replicas, databases, queues, teams, or RBAC.
- Recording secrets, resolved values, webhook payloads, OAuth tokens, or session cookies.

## Decisions

### Merge SHA is the release identity

Execution MUST verify PR #2 is merged, refresh `main`, and prove the exact merge SHA is current and contains the reviewed change before configuring Railway source or deploying. A feature-branch head is not an acceptable substitute.

Alternative: deploy the reviewed branch SHA directly. Rejected because production would no longer be reproducible from `main`.

### One bounded production run

Use one freshly approved Railway production session for deployment and Railway observations. Use the installed GitHub App and one OAuth browser session for application verification. Stop immediately on failed readiness, scope drift, unexpected deployment identity, or secret exposure.

Alternative: enable automatic deploys first. Rejected because the first release needs an observable, evidence-gated activation and rollback point.

### Preserve the volume through restart and rollback

Restart and rollback MUST reuse the attached `/data` volume. Rollback selects the last known-good application deployment; it never deletes, recreates, or replaces persistent storage.

Alternative: recreate the service on failure. Rejected because it risks losing SQLite state and delivery deduplication evidence.

## Risks / Trade-offs

- [PR head differs from the eventual merge SHA] → Deploy only the verified merge SHA from refreshed `main`.
- [A one-volume service has brief release downtime] → Keep one replica and require readiness before continuing.
- [OAuth or webhooks mutate production state during verification] → Use one selected repository and record only bounded delivery identifiers and outcomes.
- [Rollback can preserve a bad database state] → Preserve the volume, stop traffic if readiness fails, and diagnose rather than recreating storage.
- [Provider settings drift after predeployment setup] → Re-read resource IDs, variable names, repository scope, and runtime settings before deploy.

## Migration Plan

1. Verify PR #2 merged and record its exact merge SHA from refreshed `main`.
2. Reconcile the Railway service source/configuration to that SHA without widening scope.
3. Deploy once; require `/health` and `/ready` `200` before application verification.
4. Verify OAuth, selected-repository bootstrap, event projection, terminal deduplication, and restart persistence.
5. Exercise rollback while preserving the volume, restore the intended SHA, and recheck readiness.
6. Complete the redacted evidence record.

## Open Questions

None. Execution remains blocked until PR #2 is merged and its merge SHA is verified on current `main`.
