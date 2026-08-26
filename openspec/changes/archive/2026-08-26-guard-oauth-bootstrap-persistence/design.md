## Context

The OAuth callback schedules bootstrap in a detached async task. A rejected evidence write currently escapes that task.

## Goals / Non-Goals

**Goals:** prevent an unhandled rejection and retain safe operator logs.

**Non-Goals:** retrying persistence, changing evidence semantics, or logging raw errors.

## Decisions

- Catch only the persistence write at the detached boundary.
- Reuse the existing safe reconciliation logging helper with fixed `Error` or `unknown` classification.
- Cover the rejection without adding a background-job framework.

## Risks / Trade-offs

- [Evidence cannot be written during a database failure] → Emit a safe persistence-failure log; do not falsely claim evidence was retained.
