## Context

See `proposal.md` for motivation. The server has two refresh writers: the authenticated stream's initial event and the shared per-user fan-out callback. Both currently encode literal backslash characters, while the mounted client already listens for `refresh` and invalidates the canonical snapshot query correctly.

## Goals / Non-Goals

**Goals:**

- Make every existing server refresh writer produce one LF-delimited named SSE event that native `EventSource` dispatches.
- Leave one focused wire-level regression check that fails on literal `\\n` framing.

**Non-Goals:**

- Polling, a second event system, client-state redesign, dashboard ordering, CI-link changes, reconciliation changes, or unrelated cleanup.
- Authentication, authorization, provider, credential, deployment, or production changes.

## Decisions

### Correct the two existing frame literals in place

Replace the double-escaped newline sequences in both existing refresh writes with TypeScript newline escapes. This fixes the common wire contract without changing route ownership, stream scoping, triggers, or client behavior. A new encoder helper is unnecessary for two identical constant writes; extract one if a third producer creates measurable duplication.

### Test the decoded wire frame exactly

Strengthen the existing server SSE coverage so the initial write and fan-out refresh are decoded and compared with `event: refresh\ndata: {}\n\n`, with an explicit rejection of literal `\\n`. A substring check is insufficient because it cannot distinguish a dispatchable event from the current malformed bytes. Existing frontend coverage remains the proof that a dispatched named event invalidates the canonical snapshot query.

### Keep one implementation group

The defect and fix are inseparable: add the failing protocol assertion first, correct both producers, then run the complete group gate. There is no independent operational or migration group.

## Risks / Trade-offs

- [Exact framing assertion becomes intentionally strict] → Keep the assertion at the authenticated SSE boundary because line delimiters and the terminating blank line are the behavior under repair.
- [One producer could remain malformed] → Exercise both the initial stream write and the shared fan-out write before declaring the group complete.
- [Future framing logic could duplicate again] → Add an encoder only when another producer or payload shape makes it necessary.

## Migration Plan

No data migration or provider action is required. A later authorized application deployment will replace the malformed bytes; rollback is the ordinary code rollback. Deployment and live observation are outside this change's current authority.

## Operational Gates

- Verify the focused regression assertion fails against the malformed frame before changing application code.
- Require focused server and existing frontend invalidation tests, the full `bun run test` Vitest suite with a disposable loopback MongoDB, `bun run typecheck`, strict OpenSpec validation, and `git diff --check` to pass before review.
- Stop on any failed gate; do not deploy, access providers, or mutate external systems.
