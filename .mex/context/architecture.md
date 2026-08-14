---
name: architecture
description: Request, webhook, projection, and dashboard flow.
triggers: [architecture, integration, flow]
edges:
  - target: context/stack.md
    condition: implementation technology matters
  - target: context/decisions.md
    condition: rationale matters
grounds_to: []
last_updated: 2026-08-13
---

# Architecture

## Flow

`src/server.ts` receives browser and GitHub traffic. Signed GitHub webhook deliveries enter the MongoDB inbox, then `src/events.ts` drains them serially into scoped projections. `src/access.ts` builds the signed-in user's dashboard. OpenSpec push events use `src/openspec.ts` to read committed task files and project progress.

## Components

- `src/server.ts`: HTTP routes, sessions, static assets, health, readiness, and SSE.
- `src/events.ts`: verified webhook ingestion, bounded retry, and projection updates.
- `src/db.ts`: MongoDB collections, indexes, user aggregates, and size guards.
- `src/github.ts`: bounded GitHub App API access and reconciliation.
- `src/access.ts`: identity binding and user-scoped dashboard assembly.
- `src/openspec.ts`: committed OpenSpec task parsing and correlation.

## Boundaries

- GitHub is the provider; Railway hosts the service but is not queried by the dashboard.
- Mex and OpenSpec are repository-development inputs, never runtime dependencies.
- Credentials, provider administration, deployment, and production operations remain outside ordinary code paths.
