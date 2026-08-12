## Why

PR #3 proved the image can drop privileges safely, but Railway still starts it as the Dockerfile's non-root `bun` user, so the root-mounted `/data` directory remains unwritable and SQLite fails with `SQLITE_CANTOPEN`. The container must own the short root-only initialization step itself while keeping the Bun application non-root.

## What Changes

- Start the container entrypoint as root, validate the exact `/data` and database-path contract, repair only the `/data` mount root when required, then permanently drop to `bun` before starting Bun.
- Remove the `RAILWAY_RUN_UID=0` runtime dependency; the application process remains UID/GID 1000.
- Replace the incompatible-content refusal with bounded mount-root repair that never recursively changes, deletes, or overwrites database contents.
- Extend the Docker smoke contract to prove a root-owned fresh volume becomes writable, SQLite/WAL files are created, PID 1 is non-root, and an invalid or unrepairable target fails closed with sanitized diagnostics.
- Keep deployment, Railway configuration changes, production-volume inspection, and production verification in the existing operational change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `production-deployment`: Make bounded runtime ownership initialization intrinsic to the container while preserving the non-root application and durable-volume safety contract.

## Impact

- Affects the production `Dockerfile`, its POSIX entrypoint, Docker smoke validation, and the production deployment contract.
- Adds no package, service, API, credential, Railway variable, or recursive volume migration.
- Depends on PR #3 merge SHA `15a842700aac7046ab48d8edc7ee38f27c0bf7c0`, verified on refreshed `origin/main` before this change began.
- Does not alter or execute `operate-developer-command-center-production`; rollout remains blocked until this PR merges and its exact merge SHA is verified on a later refreshed `main`.
