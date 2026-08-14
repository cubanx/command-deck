---
name: router
description: Routes tasks to concise, source-backed project knowledge.
edges:
  - target: context/architecture.md
    condition: understanding flows, components, or boundaries
  - target: context/stack.md
    condition: changing dependencies or runtime configuration
  - target: context/conventions.md
    condition: writing or reviewing code
  - target: context/decisions.md
    condition: evaluating architectural choices
  - target: context/setup.md
    condition: setting up or validating the repository
  - target: patterns/INDEX.md
    condition: checking for a proven recurring workflow
last_updated: 2026-08-13
---

# Project knowledge router

Use CodeGraph first for structural code lookup. Mex is curated memory, not a replacement index.

## Current state

- The GitHub dashboard, webhook projection pipeline, local demo, and MongoDB persistence are implemented.
- Deployment and production operations are governed by separate OpenSpec changes.
- `.mex/graph.db` is machine-local support data and is not committed.

## Routing

| Need | Load |
| --- | --- |
| System flow and boundaries | `context/architecture.md` |
| Runtime and dependencies | `context/stack.md` |
| Code and verification rules | `context/conventions.md` |
| Durable architectural choices | `context/decisions.md` |
| Setup and commands | `context/setup.md` |
| Proven recurring workflows | `patterns/INDEX.md` |

Update only facts changed by real work. Add a pattern only after a project-specific workflow recurs.
