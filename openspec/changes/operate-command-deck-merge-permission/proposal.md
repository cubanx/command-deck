## Why

PR #8 can ship the guarded Merge control while installations remain read-only, but enabling and proving that control requires separately authorized GitHub App, installation, deployment, and production operations. Those operations must not become completion gates for the code pull request.

## What Changes

- Block all execution until intended PR #8 is merged, its exact merge SHA is verified on current `main`, and that code is deployed and healthy.
- Apply only the minimum GitHub App permission proven sufficient by PR #8, preferring Pull requests write through the GraphQL merge path and explicitly excluding Contents write unless contrary evidence requires a new reviewed decision.
- Obtain approval for the updated permissions on only the intended allowlisted installation accounts and verify production configuration.
- Perform one explicitly authorized safe merge proof with user-role authorization, exact-head and repository-policy evidence, then capture redacted success and rollback/repair evidence.
- Keep every provider, permission, installation, deployment, production, and merge mutation behind fresh task-scoped authorization.

## Capabilities

### New Capabilities

- `merge-permission-operations`: Post-merge permission rollout, installation approval, deployment/configuration verification, one authorized merge proof, rollback/repair, and redacted strict evidence.

### Modified Capabilities

None.

## Impact

- Operational GitHub App settings, allowlisted installation approvals, production deployment/config verification, and one authorized merge proof after PR #8.
- Requires no second code pull request and makes no repository implementation changes.
- This proposal authorizes no provider reads or writes, permission changes, installations, deployments, production actions, or merges.
