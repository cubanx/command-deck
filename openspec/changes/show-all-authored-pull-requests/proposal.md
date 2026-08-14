## Why

The dashboard currently hides healthy open pull requests authored by the signed-in user, so a healthy portfolio appears empty. Repository and pull-request bootstrap reads are also limited to their first page, which silently truncates larger GitHub App installations.

## What Changes

- Show every open pull request authored by the signed-in user across every GitHub App installation bound to that user.
- Keep attention classification unchanged, but display attention-needed pull requests first and label each pull request's state clearly.
- Preserve strict user, installation, repository, and author authorization while deduplicating the same GitHub pull request across authorized installation snapshots.
- Fail closed at installation trust boundaries unless GitHub identifies the installation account as exactly `cubanx`, `Crisp-Inc`, or `hudson-law`.
- Start the existing canonical installation bootstrap immediately after a verified allowed OAuth binding without delaying the callback redirect; retain the binding if bootstrap fails so scheduled reconciliation can recover.
- Paginate authenticated-user installation verification and installation-token repository and open-pull-request reads without applying partial reconciliation results.
- Add focused coverage for multi-installation aggregation, healthy and attention visibility and ordering, isolation, pagination, and deduplication.
- Keep GitHub App installation, deployment, provider configuration, and production verification outside this code change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `command-center-dashboard`: Display all authorized open pull requests authored by the signed-in user, with attention-needed items prioritized and state visible.
- `developer-access`: Preserve signed-in user isolation while aggregating and deduplicating authored pull requests across all bound installations.
- `provider-reconciliation`: Fully paginate supported installation, repository, and pull-request reads and preserve prior data when a paginated refresh is incomplete.
- `event-projections`: Reject or ignore webhook intake and projection work from installations outside the exact approved account allowlist.

## Impact

- Affects dashboard data selection and presentation, GitHub installation verification and post-bind bootstrap, installation reconciliation, webhook intake/projection, and their focused tests.
- Retains the existing identity and authorization model, GitHub App installation-token model, OAuth scopes, attention semantics, notification behavior, and deployment handling.
- Adds no dependency and performs no provider installation, deployment, production verification, or external-system mutation.
