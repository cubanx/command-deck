---
name: setup
description: Local setup, commands, and validation prerequisites.
triggers: [setup, install, environment, test]
edges:
  - target: context/stack.md
    condition: runtime details are needed
  - target: context/conventions.md
    condition: verification rules are needed
grounds_to: []
last_updated: 2026-08-13
---

# Setup

## Application

1. Install Bun.
2. Run `bun install --frozen-lockfile`.
3. Run `bun run dev` for the credential-free loopback demo.

Use `bun run start` only with the documented application environment. Never place secret values in this repository.

## Validation

- `bun run typecheck`
- `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun test` with a disposable local MongoDB server
- `openspec validate <change> --strict`
- `git diff --check`

`bun run seed:bindings` is an operational command, not ordinary validation; use it only with the required environment and authorization.

Tests create UUID-named `command-center-ai-test-*` databases and drop them afterward. Never point the test URI at shared or production MongoDB.

## Mex

- Validated release: `mex-agent` 0.7.0 on Node.js 22.5 or newer.
- Setup: `MEX_TELEMETRY=0 npx --yes mex-agent@0.7.0 setup --mode code-repo`
- Check: `bun run knowledge:check`

Mex is repository tooling, not an application dependency. CI runs the check only; knowledge updates remain a reviewed local action. `.mex/graph.db` is machine-local.
