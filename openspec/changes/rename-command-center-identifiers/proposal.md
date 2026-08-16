## Why

Application, runtime, and MongoDB identifiers still reuse the GitHub repository slug `dev-command-center`, which obscures whether a value names the repository or the deployed product. The repository must reserve that exact string for repository-derived metadata while the product and its isolated databases use the approved Command Center.ai family before production cutover.

## What Changes

- **BREAKING** Rename the legacy repository-slug-prefixed production MongoDB database to `command-center-production` and keep production validation fail closed on that exact value.
- Rename generated local and test databases to the `command-center-local` and `command-center-test-*` families while preserving per-user isolation and destructive-test guards.
- Rename application, package, container, manifest, example configuration, and setup identifiers to `Command Center.ai` or `command-center-ai` as appropriate.
- Preserve `dev-command-center` only when it identifies the GitHub repository, repository URLs/full-name fixtures, repository paths, or repository-scaffold metadata.
- Amend the separate `operate-developer-command-center-mongodb-cutover` plan so provider renames, credential projection, deployment, data movement, and cutover remain post-merge operations gated on this change's exact merge SHA being present on refreshed `main`.
- Do not add aliases, compatibility fallbacks, migration abstractions, dependencies, or provider mutations.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mongodb-storage`: Require canonical Command Center.ai production, local, and test database naming while retaining strict production selection and test-database isolation guards.

## Impact

- Affects MongoDB configuration in `src/db.ts` and `src/config.ts`, focused configuration/database tests, test setup, package and lock metadata, the container image label, PWA metadata, `.env.example`, and setup documentation.
- Changes the production value expected for `MONGODB_DATABASE`; the matching Atlas project/user/database and Railway projection are deliberately deferred to the separately authorized post-merge cutover.
- Does not change GitHub repository identity, authorization fixtures, provider credentials, dependencies, or external systems.
