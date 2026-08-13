## Context

The failed container reaches `openDatabase()` before `Bun.serve()` and receives `SQLITE_CANTOPEN` for `/data/command-center.sqlite`. The image declares `USER bun`, while Railway mounts volumes at runtime as root; image-layer `mkdir` or `chown` is therefore not a production fix because the mounted filesystem replaces that path.

Railway's documented workaround is to start the container with `RAILWAY_RUN_UID=0`. That cannot mean running the application as root. The pinned `oven/bun:1.3.11` image already provides `setpriv` and defines `bun:bun` as UID/GID 1000, so a small entrypoint can initialize an empty mount and permanently drop privileges without adding a package.

`deploy-developer-command-center` is complete but unarchived. This change modifies its `production-deployment` requirements and MUST NOT be archived until that prerequisite creates the canonical capability.

## Goals / Non-Goals

**Goals:**

- Let a non-root Bun process create and use SQLite on an explicitly initialized empty Railway `/data` volume.
- Refuse startup rather than recursively repair ambiguous existing content.
- Prove the process UID, SQLite file creation, and readiness with one Docker smoke check.

**Non-Goals:**

- Inspecting or repairing the attached production volume.
- Changing Railway variables, retrying deployment, or recording production evidence.
- Running the application as root or adding a privilege-drop dependency.

## Decisions

### Use a bounded root initializer, then `setpriv`

Add one POSIX-shell entrypoint. When the container actually starts as UID 0, it accepts only the configured `/data` mount, initializes it only when empty, verifies existing content is owned by `bun`, and replaces itself with the supplied command under `setpriv`. When started as non-root, it directly execs the command.

This makes privilege duration short and observable: the Bun application process is always UID 1000. It also keeps ordinary local image execution non-root. Installing `gosu` or running Bun as root adds authority without solving another requirement.

### Refuse incompatible existing content

The initializer does not use recursive `chown`. A non-empty mount containing any path not owned by `bun` exits with a sanitized diagnostic. The state of the already-attached production volume must be inspected and resolved under a separate authorized operational decision before `RAILWAY_RUN_UID=0` is enabled or deployment is retried.

### Test the real container boundary

Add one repository smoke script using Docker CLI only. It builds the image, starts it as Railway would with a fresh named volume and fictional configuration, waits for `/ready`, then asserts the application UID is 1000 and SQLite exists on `/data`. It also seeds an incompatible volume and asserts startup fails without changing the sentinel's ownership. No test framework or dependency is added.

## Risks / Trade-offs

- [A root entrypoint has more authority than the application needs] → Restrict it to `/data`, avoid recursion, and exec Bun only after dropping to UID 1000.
- [The current persistent volume is not fresh] → Refuse incompatible content and keep inspection or repair outside this change.
- [A Docker named volume is not Railway] → Treat the smoke as the local ownership contract; production retry and evidence remain separate gates.
- [The prerequisite capability is not canonical yet] → Strictly validate now but block archive until `deploy-developer-command-center` is archived.

## Migration Plan

1. Merge and archive `deploy-developer-command-center`, verifying its exact merge SHA on current `main`.
2. Review, merge, and archive this repository change.
3. In a separate authorized production task, inspect the attached volume without changing it and decide whether its state satisfies the empty-or-`bun`-owned precondition.
4. Only after that gate, set `RAILWAY_RUN_UID=0`, retry deployment, and record readiness/persistence evidence.
5. Roll back code while retaining the volume; never recreate or recursively re-own it as a shortcut.
