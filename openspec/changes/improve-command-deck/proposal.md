## Why

The live Command Deck now exposes enough pull requests, deployments, and OpenSpec evidence that its single-checkout, in-memory controls and verbose cards no longer scale. Operators also need trustworthy deployment state, durable browser-local configuration, explicit appearance preferences, on-demand reconciliation, and a merge action that fails closed under the current read-only GitHub App installation.

## What Changes

- Compact embedded OpenSpec evidence into a collapsed native disclosure while retaining progress, current group, task evidence, and source links.
- Remove the visible pull-request section heading while preserving an accessible landmark name.
- Keep native sticky pull-request controls visible while scrolling, with dependency-free fuzzy search, exact status buckets, a searchable repository multi-select, final result count, and one Clear action.
- Project failed GitHub Actions workflow names and run links from authoritative `workflow_run` events while keeping Actions and Checks distinct; defer job/step detail that would require additional polling and schema machinery.
- Fix deployment status selection and ordering at the shared ingestion/projection root cause, with a regression test for the stale `in_progress` case.
- Route checkout and notification actions to one configuration screen that also owns appearance and an authenticated, user-scoped `Reconcile now` control reusing the existing reconciliation path.
- Persist and permission-revalidate multiple browser-local organization roots and exact repository overrides, resolve known repositories without ambiguous association, and scope local branch/OpenSpec evidence by stable repository identity without uploading local data.
- Add persisted System, Dark, and Light appearance preferences using native color-scheme behavior.
- Replace the placeholder icon with an attributed CC BY-SA OpenMoji adaptation, a stable Night Deck install icon, an adaptive Signal-light/Night-dark favicon and in-app mark, and real Apple touch, PWA, and maskable assets.
- Add a guarded per-PR Merge control that is visibly unavailable under current read-only App permissions and, once enabled, reauthorizes the signed-in user, revalidates exact current PR/protection/OpenSpec state, confirms the repository convention `merge_commit`, and refreshes sanitized outcomes.
- Keep GitHub App permission changes, installation approvals, deployment verification, and a production merge proof in a separate post-merge operational change.

## Capabilities

### New Capabilities

- `appearance-preferences`: Browser-local System, Dark, and Light selection and accessible application behavior.
- `pull-request-merge`: Least-privilege, user-authorized, exact-head, policy-aware per-PR merge behavior and unavailable states.

### Modified Capabilities

- `command-center-dashboard`: Compact OpenSpec evidence, accessible heading removal, sticky search/filter/sort controls, Actions failure links, unified configuration entry points, repository-specific checkout state, reconciliation feedback, and merge affordances.
- `openspec-progress`: Multi-checkout persistence, permission revalidation, stable repository identity, exact overrides, and repository-scoped local evidence matching.
- `provider-reconciliation`: Authoritative deployment status selection plus authenticated user-scoped on-demand reconciliation through the existing path.
- `event-projections`: Correct ordering and stale-event rejection for deployment status updates plus authoritative failed-workflow identity, name, and URL projection.
- `transition-notifications`: Relocate the existing browser notification configuration without expanding notification behavior.
- `installable-pwa`: Supply cross-browser install icons and explicit Creative Commons provenance.

## Impact

- Affects the dashboard/server routes, dependency-free client filtering, browser-local configuration and File System Access flow, GitHub client and event projection, authentication/authorization checks, styles, and focused behavioral/accessibility tests.
- Adds no dependency and sends no local checkout handle, path, file, branch, or OpenSpec data to the server.
- Depends on PR #5 merged as `aeebad98c560dcb3b2d998837f4141b90a36ea5b` on current `main`; that prerequisite is verified.
- Does not change GitHub App permissions, provider configuration, installations, deployment, production state, or merge a pull request.
