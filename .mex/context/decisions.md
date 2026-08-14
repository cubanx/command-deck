---
name: decisions
description: Durable architectural choices and their consequences.
triggers: [decision, rationale, alternative]
edges:
  - target: context/architecture.md
    condition: a decision affects system flow
  - target: context/stack.md
    condition: a decision affects technology
grounds_to: []
last_updated: 2026-08-13
---

# Decisions

## Webhook-first projections

Authenticated GitHub webhooks are the incremental source. Provider API calls are limited to bootstrap, repair, targeted OpenSpec reads, and conditional reconciliation. This bounds provider traffic and makes delivery replay explicit.

## User-rooted MongoDB aggregates

User-visible GitHub identities, installations, repositories, pull requests, and notifications live in a size-guarded user aggregate. Sessions, OAuth state, and global delivery deduplication remain separate because their lifecycle and scope differ.

## Railway stays outside dashboard reads

Deployment state comes from GitHub deployment events and reconciliation. The dashboard does not require Railway API access.

## OpenSpec progress is committed evidence

Only committed `openspec/changes/*/tasks.md` content is correlated to pull requests. Local paths and contents are not uploaded.

## Credential-free local demo

Local demo mode exercises the real dashboard and projection paths with deterministic fixtures while hosted environments reject it.

## Mex and CodeGraph stay separate

CodeGraph remains first for structural lookup. Mex stores small, reviewed project knowledge; its local graph database is ignored.
