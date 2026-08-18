## Why

After the MongoDB foundation merges, production needs a separately authorized cutover that preserves the sole user's existing GitHub App binding without carrying the rest of the unused SQLite database forward. The current `operate-developer-command-center-production` change assumes SQLite and must not remain an alternative executable playbook.

## What Changes

- Depend on `replace-sqlite-with-mongodb`, `rename-command-center-identifiers`, and `fix-installation-identity` being merged, then verify each exact merge SHA on refreshed current `main` before any provider or production operation.
- Reconcile the Atlas project and existing cluster to `command-center-ai`, use `command-center-ai-production` as the shared hosted database, establish `command-center-ai-production-runtime` with only the required database scope, and project that same database and credential to the exact Railway target `Command Deck.ai` / `production` / `developer-command-center` under fresh authorization.
- Explicitly supersede the SQLite-specific execution path in `operate-developer-command-center-production`; retire that stale change before applying this one.
- Verify Railway source/deploy behavior, MongoDB Atlas readiness, credentials, network access, and rollback prerequisites under fresh task-scoped production authorization.
- Stop application writes without optimizing for uptime; this is a single-user, currently unused deployment.
- Read only the GitHub user ID, GitHub App installation ID, and installation account login for every existing binding from SQLite, validate every account login against `cubanx`, `Crisp-Inc`, or `hudson-law`, and seed those bindings into the MongoDB user aggregate. The sole allowed reconstruction is the observed missing account login for `(362276, 153423118)`, and only after authoritative GitHub App ownership proves exact account `Crisp-Inc` and the user confirms the resulting tuple.
- Do not migrate repositories, pull requests, deployments, OpenSpec progress, notifications, sessions, OAuth states, webhook deliveries, ETags, cached responses, or any other SQLite data.
- Deploy the MongoDB runtime, have the user sign in once without repeating the GitHub App installation flow, bootstrap the personal projection from GitHub using installation tokens, and verify readiness, authorization, isolation, webhook handling, reconciliation, and dashboard behavior.
- Roll back code and configuration if activation fails; do not introduce dual writes, reverse migration, or historical-data preservation machinery.
- Capture bounded evidence for the merge gate, binding handoff, deployment, bootstrap, verification, and rollback disposition.
- When the exact reviewed MongoDB runtime is already active, accept its bounded final state instead of replaying redundant seed or deployment operations. This records observed state, not unobserved historical execution or ordering.

## Capabilities

### New Capabilities

- `mongodb-cutover-operations`: Defines the authorized, merge-gated MongoDB cutover, narrow binding handoff, bootstrap, verification, and rollback contract.

### Modified Capabilities

None. This change replaces, rather than extends, the unexecuted SQLite production-operation plan.

## Impact

- Supersedes `openspec/changes/operate-developer-command-center-production` and its SQLite volume/restart assumptions.
- Requires read-only access to the old production SQLite store and authorized writes to the target MongoDB database and exact Railway target during execution.
- Seeds only three non-secret binding fields; GitHub provider projections are rebuilt canonically after deployment.
- Requires the installation identity fix merge SHA on current `main` before separately authorized deployment and production operations.
- Is a one-off operational delta intended for archive without canonical spec synchronization after human review.
