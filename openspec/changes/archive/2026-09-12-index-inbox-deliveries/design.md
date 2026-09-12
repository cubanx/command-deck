## Context

Current main is `4b34723ea849d81cb2fa5693df5f3785e3e920d0`. The inbox initializer creates only the status/retry index; the drain sorts eligible full documents by received time.

User-supplied MongoDB 8.0.32 evidence reproduced code 292 with a 33554432-byte sort limit. After the user created `{receivedAt:1}`, the unchanged unhinted query selected FETCH over IXSCAN on `receivedAt_1`, without blocking SORT, at `2026-09-11T19:29:26.290Z`. This is query-plan evidence, not end-to-end recovery proof.

## Goals / Non-Goals

**Goal:** Make the demonstrated index available through normal idempotent initialization.

**Non-goals:** Driver upgrades, hints, retries, batching, serialization changes, production operations, and parent retention/conflict acceptance.

## Decisions

Add the single-field ascending index alongside the existing retry index. Reuse the MongoDB integration harness and intercept the real drain cursor to inspect its unhinted query plan before executing it. Check that an available plan supplies index ordering; planner selection on tiny fixtures need not match production cardinality. Verify eligibility and chronological results as well as repeated initialization.

Disk spilling and query rewrites are unnecessary for this evidenced failure. The index does not bound application memory used by `toArray()`.

## Risks / Trade-offs

- Additional index storage and write cost: limited to one received-time key per delivery.
- Planner choice depends on data: local tests prove an available ordered plan; supplied production evidence proves the winning plan for that snapshot.

## Migration Plan

After separately authorized publication and deployment, normal initialization creates the index or accepts the existing compatible index. Rolling back code does not require dropping the additive index. No deployment is authorized here. Actual webhook recovery remains a separate parent-owned check.
