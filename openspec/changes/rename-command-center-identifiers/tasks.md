## 1. Database Naming Contracts

- [x] 1.1 Update focused configuration and MongoDB tests first to require `command-center-production`, `command-center-local`, and isolated `command-center-test-*` names, including rejection of stale or unsafe names.
- [x] 1.2 Rename the existing production defaults/validators, local generators, test generators/guards, test support, and package test command without adding a compatibility path.
- [x] 1.3 Run the focused configuration and MongoDB naming tests and preserve existing isolation/readiness behavior.

## 2. Application and Repository Metadata

- [x] 2.1 Update existing quality-contract expectations first for the `command-center-ai` container identifier and any user-visible Command Center.ai metadata covered by tests.
- [x] 2.2 Rename package/lock, container, manifest, example configuration, README, and setup identifiers to the approved Command Center.ai family.
- [x] 2.3 Audit every remaining exact `dev-command-center` occurrence and retain only GitHub repository identity, URLs/full-name fixtures, repository paths, repository-scaffold metadata, or immutable historical evidence.

## 3. Post-Merge Operational Gate

- [x] 3.1 Amend `operate-developer-command-center-mongodb-cutover` so its intended Atlas project, cluster, database, runtime user, and Railway database projection use the approved names.
- [x] 3.2 Require this rename change's exact merge SHA on refreshed `main` before task 3.1 quiesces SQLite or any provider rename, credential projection, deployment, data movement, cutover, or verification begins; require no second code PR.
- [x] 3.3 Strictly validate the amended operational OpenSpec without executing or marking any production task complete.

## 4. Validation

- [x] 4.1 Run typecheck, the repository test suite with its disposable MongoDB convention, strict validation for this change, and `git diff --check`.
- [x] 4.2 Review the final diff and status, confirm no external mutation or unrelated fixture rename occurred, and leave all changes uncommitted for human review.
