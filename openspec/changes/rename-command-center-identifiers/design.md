## Context

See `proposal.md` for motivation. Database naming is enforced in two configuration seams: the shared MongoDB configuration/guard path and server configuration loading. Tests and local commands generate their own database names, while package, container, manifest, examples, and setup documentation carry application identity. GitHub fixtures and repository metadata intentionally use the repository slug and are not application identifiers.

The separate MongoDB cutover already owns Atlas, Railway, credentials, deployment, data handoff, and production verification. This code change must land first and cannot perform those operations.

## Goals / Non-Goals

**Goals:**

- Apply the approved names directly at the existing naming and validation seams.
- Preserve strict production validation, isolated local/test names, and destructive-test protection.
- Make the repository slug exception explicit and mechanically auditable.
- Add an exact-merge-SHA/current-`main` dependency to the post-merge cutover before its quiesce phase.

**Non-Goals:**

- Add compatibility aliases, dual-name lookup, migrations, new configuration abstractions, or dependencies.
- Rename the GitHub repository or change repository-derived fixtures and metadata.
- Mutate Atlas, Railway, GitHub, 1Password, production data, or credentials.

## Decisions

### Replace literals at their existing ownership seams

Update the current defaults and guards in place rather than introduce a naming registry. The production name remains an exact validation value; Railway, local, and test generators keep their existing isolation suffixes under the single `command-center-ai-*` database family. Existing helpers and environment validation remain authoritative.

Alternative: centralize every product and database identifier in a new module. Rejected because the values serve different layers, are not repeatedly composed through a common API, and a new abstraction would add indirection without reducing risk.

### Classify exact repository-slug occurrences before replacement

Preserve `dev-command-center` in GitHub repository names, `full_name`/URL fixtures, repository paths, and repository-scaffold metadata. Replace it everywhere else with the approved product, machine, or database name. Finish with a repository-wide exact-string audit so accidental leftovers fail review.

Alternative: global search-and-replace. Rejected because it would corrupt repository-identity tests and metadata.

### Keep provider renames in the existing operational cutover

Amend `operate-developer-command-center-mongodb-cutover` rather than create a second competing production plan. Its preflight may document current names, but no quiesce, projection, deployment, data movement, or activation task may proceed until this rename PR's exact merge SHA is verified on refreshed `main`. The operation then renames or creates only the approved Atlas project/user/database and Railway projection under fresh authorization.

Alternative: perform provider changes from this PR-owned change. Rejected because they cannot be completed or reviewed before merge and require separate production authorization.

## Risks / Trade-offs

- [A repository fixture is renamed accidentally] -> Classify exact-string occurrences and retain focused fixture tests.
- [Production accepts a stale database] -> Keep exact fail-closed validation and cover the new value plus rejection in tests.
- [A destructive test targets a non-test database] -> Change the generator and guard together, then test both acceptance and rejection.
- [Code merges before providers are ready] -> Keep all provider work in the merge-gated operational cutover; the deployed runtime must not be activated with mismatched configuration.
- [Historical operational evidence contains old names] -> Preserve immutable historical facts, but update executable gates and intended target identities.

## Migration Plan

1. Land this repository-only change after tests and strict OpenSpec validation.
2. Refresh `main` and record this change's exact merge SHA in `operate-developer-command-center-mongodb-cutover`.
3. Under separate task-scoped authorization, reconcile Atlas and Railway identifiers to `command-center-ai`, `command-center-ai-production`, and `command-center-ai-production-runtime` before quiescing SQLite.
4. Continue the existing one-way cutover, verification, and rollback plan without a second code PR.

Rollback before activation is to keep the prior deployed revision and provider configuration. After activation, use the cutover's existing bounded deployment rollback; do not add dual-name application behavior.
