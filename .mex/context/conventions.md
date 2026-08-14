---
name: conventions
description: Project-specific coding, safety, and verification rules.
triggers: [convention, review, style, verify]
edges:
  - target: context/architecture.md
    condition: a rule depends on system flow
  - target: context/setup.md
    condition: validation commands are needed
grounds_to: []
last_updated: 2026-08-13
---

# Conventions

- Use camelCase TypeScript names and type-only imports where applicable.
- Keep tests in `test/*.test.ts` and use distinctive fictional data.
- Verify webhook HMACs against raw bytes before inserting an inbox delivery.
- Preserve idempotency with provider delivery identifiers and bounded retries.
- Escape provider-controlled text and accept only validated HTTP(S) links.
- Scope projections to verified users and installations; fail closed on ambiguity.
- Handle, rethrow, or sanitise and log errors. Never silently fall back.

## Verify

- `bun run typecheck`
- `bun test` with the documented disposable local MongoDB prerequisite
- `openspec validate <change> --strict` for OpenSpec work
- `git diff --check`
