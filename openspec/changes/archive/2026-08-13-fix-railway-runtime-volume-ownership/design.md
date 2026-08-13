## Context

PR #3 merge SHA `15a842700aac7046ab48d8edc7ee38f27c0bf7c0` added a `setpriv` entrypoint but retained `USER bun`. Railway mounts `/data` at runtime as root, after image layers are built, so the entrypoint never receives sufficient privilege to repair the mount and Bun still fails in `openDatabase()` with `SQLITE_CANTOPEN` before the server starts.

The pinned `oven/bun:1.3.11` runtime already contains POSIX shell, `stat`, `chown`, and `setpriv`, and maps `bun:bun` to UID/GID 1000. The production-operation change owns all Railway mutation and verification after this code PR merges.

## Goals / Non-Goals

**Goals:**

- Make the runtime-mounted `/data` directory writable without a Railway UID override.
- Bound root authority to validation and a non-recursive ownership change of the mount root.
- Make the stable application identity and privilege drop observable in a container validation check.
- Fail closed with fixed diagnostics when configuration, identity, ownership repair, or privilege drop is unsafe.

**Non-Goals:**

- Recursively migrating volume contents or changing ownership of an existing database.
- Inspecting or mutating the production volume, variables, deployment, or service.
- Adding a supervisor, init framework, sidecar, package, or configurable privilege system.

## Decisions

### Declare root only as the image startup identity

The runtime stage declares `USER root` so Railway naturally launches the repository entrypoint with enough authority to initialize its root-mounted volume. The entrypoint immediately validates the exact Railway mount and database paths, then replaces itself with the Bun command under `setpriv` as `bun`. `RAILWAY_RUN_UID=0` is removed from the contract because the image owns both halves of the transition.

Alternative: retain `USER bun` and configure Railway's UID override. Rejected because the requested invariant is intrinsic container startup without an application-runtime override, and the prior deployment proved the non-root image cannot repair the runtime mount.

### Repair only the mount directory

The entrypoint verifies `bun:bun` remains UID/GID 1000, reads `/data` ownership numerically, and runs one non-recursive `chown 1000:1000 /data` only when required. It never scans, deletes, overwrites, or recursively changes children. Existing SQLite files must already be accessible to `bun`; otherwise normal database startup fails closed.

Alternative: recursively `chown /data`. Rejected because unrelated or intentionally owned volume contents are outside the application's authority. Alternative: refuse every non-`bun` child. Rejected because it does not repair the root-mounted directory that caused the incident and adds a volume walk unrelated to the required mount-root fix.

### Use fixed diagnostics and a real read-only failure

Configuration, identity, ownership inspection, ownership repair, and privilege-drop failures emit fixed messages without environment values or filesystem enumeration. The Docker volume validation uses a fresh root-owned named volume for success and mounts another named volume read-only to prove ownership repair fails without changing its sentinel.

Alternative: unit-test shell branches with mocks. Rejected because the Docker boundary is the behavior that failed and the existing validation script already provides the smallest executable contract.

## Risks / Trade-offs

- [The runtime image starts briefly as root] → Validate only fixed paths, perform at most one mount-root `chown`, then `exec setpriv`; assert PID 1 is UID 1000.
- [The upstream `bun` identity changes] → Require UID/GID 1000 at startup and fail before changing ownership.
- [Existing database files are not accessible to `bun`] → Do not broaden root authority; fail database startup and resolve the specific production state through the authorized operational change.
- [Docker named volumes do not reproduce every Railway detail] → Treat the validation as the local ownership and privilege contract; keep real deployment evidence in `operate-developer-command-center-production`.

## Migration Plan

1. Complete and validate this code change from refreshed `main` containing verified PR #3 merge SHA `15a842700aac7046ab48d8edc7ee38f27c0bf7c0`.
2. Review and merge PR #4 without changing Railway or the attached volume from this task.
3. In the existing production-operation task, refresh `main`, verify PR #4's exact merge SHA, inspect the intended configuration and volume state under fresh authorization, and deploy once.
4. Require `/ready`, non-root process, SQLite persistence, and rollback evidence while preserving the volume.
5. If rollout fails, restore the last known-good application deployment without deleting, recreating, or recursively re-owning the volume.
