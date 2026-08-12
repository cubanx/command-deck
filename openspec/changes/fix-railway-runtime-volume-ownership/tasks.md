## 1. Container Smoke Contract

- [x] 1.1 Update the dependency-free Docker smoke test to require intrinsic root initialization without `RAILWAY_RUN_UID=0`, then assert PID 1 runs as UID 1000 and SQLite/WAL files are owned by UID/GID 1000 on a fresh root-owned `/data` volume.
- [x] 1.2 Add one read-only `/data` failure case that proves ownership repair fails with a sanitized diagnostic while existing sentinel contents and ownership remain unchanged.

## 2. Bounded Runtime Initialization

- [x] 2.1 Make root the image startup identity while retaining the existing pinned Bun image, root-owned entrypoint, single process, and dependency set.
- [x] 2.2 Replace the entrypoint's Railway UID override and child scan with exact path and stable UID/GID validation, a conditional non-recursive mount-root ownership repair, and permanent `setpriv` execution as `bun`.

## 3. Repository Validation

- [x] 3.1 Run the Docker build/runtime smoke test, existing Bun tests, typecheck, POSIX shell syntax checks, and `git diff --check`.
- [x] 3.2 Strictly validate `fix-railway-runtime-volume-ownership`, inspect the final diff and worktree status, and leave deployment plus production verification untouched for the existing operational task.
