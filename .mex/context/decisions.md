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
last_updated: 2026-09-13
---

# Decisions

## Webhook-first projections

Authenticated GitHub webhooks are the incremental source. Provider API calls are limited to bootstrap, repair, targeted OpenSpec reads, and reconciliation. This bounds provider traffic and makes delivery replay explicit.

## Domain-owned MongoDB documents

Users contain identity and UI preferences. Shared installations, user-installation bindings, repositories, pull requests and deployments have independent documents. OpenSpec evidence is embedded only in its associated PR. Sessions, OAuth state, merge intents, webhook receipts and reconciliation runs retain their independent lifecycles. No data migration or dual writes: deployment requires the reviewed clean-start procedure.

## Railway stays outside dashboard reads

Deployment state comes from GitHub deployment events and reconciliation. The dashboard does not require Railway API access.

## OpenSpec progress is committed evidence

Only committed `openspec/changes/*/tasks.md` content is correlated to pull requests. Local paths and contents are not uploaded.

## Credential-free local demo

Local demo mode exercises the real dashboard and projection paths with deterministic fixtures while hosted environments reject it.

## Mex and CodeGraph stay separate

CodeGraph remains first for structural lookup. Mex stores small, reviewed project knowledge; its local graph database is ignored.
