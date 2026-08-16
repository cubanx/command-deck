---
name: agents
description: Project identity, hard boundaries, commands, and routing entrypoint.
last_updated: 2026-08-13
---

# Command Center.ai

A Bun and TypeScript service that projects signed GitHub activity and committed OpenSpec progress into a developer dashboard.

## Non-negotiables

- Verify GitHub webhook signatures against the raw request body before persistence.
- Keep user, installation, and provider projections scoped and fail closed.
- Keep credentials and production mutations outside ordinary repository work.
- Use CodeGraph first for structural lookup; Mex stores curated project memory.

## Commands

- Dev: `bun run dev`
- Typecheck: `bun run typecheck`
- Test: `bun test`
- OpenSpec: `openspec validate <change> --strict`

Read `ROUTER.md` for task-specific context.
