## 1. Container Smoke Contract

- [x] 1.1 Add a dependency-free Docker smoke check that builds the production image and proves a Railway-style root bootstrap on a fresh `/data` volume starts Bun as UID 1000, creates SQLite on the volume, and reaches `/ready`.
- [x] 1.2 Extend the smoke check with an incompatible non-empty volume and prove startup fails without changing existing ownership or content.

## 2. Non-Root Volume Initialization

- [x] 2.1 Add the minimum root-aware entrypoint that accepts only `/data`, initializes an empty mount for `bun`, rejects incompatible existing content, and permanently drops privileges with the pinned image's existing `setpriv`.
- [x] 2.2 Wire the Dockerfile to the entrypoint while retaining `USER bun` for ordinary runs and document the required `RAILWAY_RUN_UID=0` bootstrap plus the existing-volume operational gate.

## 3. Repository Validation

- [x] 3.1 Run the Docker smoke check, `bun test`, `bun run typecheck`, shell syntax validation, Docker static checks, and `git diff --check`.
- [x] 3.2 Run `openspec validate fix-railway-sqlite-volume-permissions --strict --no-interactive` and confirm the change remains blocked from archive until `deploy-developer-command-center` is archived first.
