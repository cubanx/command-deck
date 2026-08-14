---
name: stack
description: Runtime, storage, tooling, and dependency constraints.
triggers: [dependency, runtime, library, technology]
edges:
  - target: context/setup.md
    condition: commands or environment are needed
  - target: context/conventions.md
    condition: implementation rules are needed
grounds_to: []
last_updated: 2026-08-13
---

# Stack

- Bun runs the TypeScript HTTP service, scripts, and tests.
- TypeScript uses strict checking through `bun run typecheck`.
- MongoDB driver 6.19 provides persistence; runtime and database-backed tests require MongoDB.
- Bun's built-in test runner executes `test/*.test.ts`.
- GitHub App REST APIs and signed webhooks provide external state.
- Railway is deployment infrastructure only.

Mex 0.7.0 is invoked as repository tooling with `npx`; it is deliberately absent from `package.json` and `bun.lock`.
