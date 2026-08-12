## Why

Production execution must happen only after PR #2 is merged and its exact merge SHA is verified on current `main`. Keeping deployment and verification outside the code PR prevents an unmerged branch from becoming an accidental production release.

## What Changes

- Verify PR #2 is merged and its exact merge SHA is present on current `main` before any production mutation.
- Bind or deploy the Railway service from that exact reviewed `main` SHA.
- Gate rollout on liveness, readiness, OAuth, selected-repository bootstrap, signed GitHub event projection, persistence, and rollback evidence.
- Preserve the existing Railway volume during restart and rollback.
- Record redacted operational evidence without credentials or resolved secret values.

## Capabilities

### New Capabilities

- `production-operations`: Evidence-gated deployment, verification, durability, and rollback of the hosted developer command center.

### Modified Capabilities

None.

## Impact

- Depends on PR #2 for `deploy-developer-command-center` being merged and its merge SHA being verified on current `main`.
- Operates the existing Crisp-Inc Railway service, persistent volume, public domain, and personal `cubanx` GitHub App installation.
- Does not add application code, infrastructure services, credentials, teams, RBAC, queues, or databases.
