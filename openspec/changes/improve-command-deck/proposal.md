## Why

The live Command Deck now exposes enough pull requests, deployments, and OpenSpec evidence that its single-checkout, in-memory controls and verbose cards no longer scale. Operators also need trustworthy deployment state, durable browser-local configuration, explicit appearance preferences, on-demand reconciliation, and a merge action that fails closed under the current read-only GitHub App installation.

## What Changes

- Compact embedded OpenSpec evidence into a collapsed native disclosure while retaining progress, current group, task evidence, and source links, and give that disclosure a darker appearance-aware surface with readable text, links, borders, and focus states.
- Remove the visible pull-request section heading while preserving an accessible landmark name.
- Keep native sticky pull-request controls visible while scrolling, with dependency-free fuzzy search, exact status buckets, a searchable repository multi-select, final result count, one Clear action, and a browser-local sort selector. Organize search, filters, repository selection, sorting, direction, result count, and Clear into stable readable groups rather than one wrapping control stream. Default to Closest to merge using a visible deterministic unresolved-gate count, support Recently updated, PR number, OpenSpec progress, and Repository ordering, and leave Codex activity explicitly unavailable until its separate OpenSpec supplies ordering data.
- Project failed GitHub Actions workflow names and run links from authoritative `workflow_run` events while keeping Actions and Checks distinct; defer job/step detail that would require additional polling and schema machinery.
- Fix deployment status selection and ordering at the shared ingestion/projection root cause, with a regression test for the stale `in_progress` case.
- Replace the dashboard's checkout and notification actions with a signed-in GitHub avatar at the right edge of the navbar. Its compact native dropdown presents Appearance as vertical System, Light, and Dark menu choices with a checkmark on the active choice, plus a conventional gear-labelled Configuration action that opens a dedicated `/configuration` page.
- Move local checkout mappings and overrides, notification configuration, and the authenticated user-scoped `Reconcile now` control to that dedicated configuration page without duplicating them in the dashboard body or header. Keep appearance only in the avatar menu.
- Make the combined brand mark and Command center hero one accessible home link, and style Configuration as a compact menu row while retaining native link semantics.
- Persist and permission-revalidate multiple browser-local organization roots and exact repository overrides, resolve known repositories without ambiguous association, and scope local branch/OpenSpec evidence by stable repository identity without uploading local data.
- Add persisted System, Dark, and Light appearance preferences using native color-scheme behavior.
- Replace the placeholder icon with an attributed CC BY-SA OpenMoji adaptation, a stable Night Deck install icon, an adaptive Signal-light/Night-dark favicon and in-app mark, and real Apple touch, PWA, and maskable assets.
- Add a guarded per-PR Merge control beside the linked title only when the same authoritative `mergeable=true` or clean projection used by the Mergeable pill, plus the existing open, non-draft, and installation-write gates, permit the action. Once activated, it reauthorizes the signed-in user, revalidates exact current PR/protection/OpenSpec state, confirms the repository convention `merge_commit`, and refreshes sanitized outcomes.
- Author the dependency-free browser behavior in TypeScript, compile it with Bun for every development, test, start, and container path, and replace opaque boolean clusters with named states and predicates without changing dashboard behavior.
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

- Affects the dashboard/server routes, signed-in user projection, Bun-built TypeScript browser entry, dependency-free client filtering and sorting, browser-local configuration and File System Access flow, GitHub client and event projection, authentication/authorization checks, styles, packaging, and focused behavioral/accessibility tests.
- Exposes only the signed-in user's validated GitHub avatar URL to the browser. Invalid or missing avatar data uses a safe fallback; local fixture mode supplies deterministic fictional avatar evidence.
- Adds no dependency and sends no local checkout handle, path, file, branch, or OpenSpec data to the server.
- Persists only the allowlisted pull-request sort mode and direction browser-locally. PR #8 does not produce, select, parse, or consume Codex activity; `mirror-codex-activity-order` owns that later producer and activation contract.
- Depends on PR #5 merged as `aeebad98c560dcb3b2d998837f4141b90a36ea5b` on current `main`; that prerequisite is verified.
- Does not change GitHub App permissions, provider configuration, installations, deployment, production state, or merge a pull request.
