## Why

The first Railway production container cannot open `/data/command-center.sqlite` because the image starts as non-root `bun` without establishing a writable `/data` path. This prevents the readiness server from starting and must be fixed without weakening the non-root runtime requirement or guessing at the state of the attached persistent volume.

## What Changes

- Add a bounded runtime initializer for Railway's root-mounted `/data` volume, then permanently drop to `bun` before starting the application.
- Add a Docker smoke check proving the non-root runtime can create SQLite files on a fresh `/data` volume and become ready.
- Gate any existing-volume ownership repair as a separate, explicit operational decision; the application remains non-root and does not mutate an ambiguous persistent volume as root.
- Keep production retry, deployment evidence, and volume operations outside this code change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `production-deployment`: Require a non-root runtime with writable fresh-volume SQLite storage and fail-closed handling for an existing volume whose ownership prevents access.

## Impact

- Affects the runtime `Dockerfile`, Docker smoke validation, and production deployment documentation.
- Adds no dependency, API change, Railway setting change, or automatic persistent-volume repair.
- Depends on `deploy-developer-command-center` being archived first so its `production-deployment` capability exists canonically before this change is archived.
