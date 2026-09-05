## Context

Starting point: freshly fetched `origin/main` and clean detached HEAD both equal `b57bb94d91a0c1fc0a4073a9101f58cd7df44261`. Historical controller evidence identifies PR #22 merge `e2c22d61dc4f3bdfe7268c581adc7f8e979dfb0b`, Railway deployment `4ba951e8-680b-46d1-9fdf-e0ecb9f9e1cc`, and repeated `reconciliation failed Error` through 2026-09-04. Those provider facts were supplied, not independently refreshed here.

Current source explains the missing context:

- `createReconciliationCoordinator` supplies the exact generic fallback and combines targeted execution and run bookkeeping in one catch, retaining neither target nor stage.
- `reconcileTargetedPullRequest` performs local reads and credential creation before the provider reporter can run. Its coordinator receives these rejections.
- `reconcilePullRequest` returns asynchronous projection persistence without awaiting it inside its try; rejected persistence bypasses that catch. The provider reporter itself lacks installation identity.
- Installation reconciliation logs per-installation errors before throwing an ordinary aggregate error. `createBroadReconciler` suppresses every rejection, including unexpected failures that were never logged.
- Existing tests assert logger argument arrays, including the generic fallback, rather than the bytes emitted by the production Bun runtime.

This establishes the log-loss mechanism, not which hidden production exception occurred. Fresh contextual production logs are required to diagnose the latter.

## Goals / Non-Goals

**Goals:** Repair the shared ownership boundary, retain actionable operation/category context, preserve fail-closed outcomes and serial queue recovery, and prove one parseable diagnostic per genuine failure.

**Non-Goals:** Fix an unobserved provider incident, alter authorization or retries, redesign logging across the service, add dependencies, migrate data, or manufacture production failures.

## Decisions

### Serialize safe fields once at the owning boundary

Reuse the existing reconciliation logging helper for one JSON string per stderr line. Carry locally selected operation/category and installation identity through execution and bookkeeping. Provider status must be a validated HTTP status; arbitrary error names, messages, bodies, URLs, and supplied diagnostic objects are not trusted safe data. Prefer finite classifications and locally authored summaries; retain existing sanitized provider classifications only through their reviewed sanitizer.

Plain `console.error(event, object)` was rejected because runtime inspection formatting is not a stable one-line transport. Raw exception JSON or message copying was rejected because tokens and payloads can occur in any exception field. A logging dependency is unnecessary.

Railway documents `message` as the displayed log text, `level` as severity, and remaining JSON fields as queryable attributes. Include an actionable locally constructed `message` plus `level: error`, installation, operation, and category in the same object; an `event` field alone is insufficient for the intended display contract. Source: [Railway structured logging](https://docs.railway.com/guides/structured-logging-production), checked 2026-09-05. This is documentation evidence, not live ingestion proof.

### Preserve one owner per failure

Targeted provider failures, rejected persistence, credential/setup failures, and separate audit/bookkeeping failures must have explicit ownership. Await persistence inside its intended boundary. Suppress only an internally identified already-reported aggregate/failure, never errors matched by message text or every rejection indiscriminately. A distinct persistence or audit failure deserves its own diagnostic; it is not a duplicate of the provider error.

No-change, closed-target handling, successful bounded retries, and established expected outcomes keep their existing result semantics and emit no terminal error. Unknown errors retain failed outcomes and a safe operation/category instead of disappearing. Broad discovery failures before an installation is known explicitly identify broad scope with unavailable installation identity rather than inventing one.

### Prove transport locally and receipt after deployment

Focused tests spawn Bun, exercise real reconciliation boundaries with fictional inputs, capture stderr without intercepting `console.error`, split physical lines, and parse each as JSON. Assert cardinality, installation, operation/category, status, queue release, and absence of malicious canaries from names/messages/payloads. Existing targeted/server/provider tests verify wiring and preserved outcomes.

Local stderr proves emitted transport bytes, not Railway ingestion or deployed behavior. After separately authorized publication/deployment and exact-SHA proof, read fresh natural Railway logs through reviewed routes, inspect the received fields, and check for generic and duplicate emissions. If no natural failure occurs, leave failure-observability acceptance pending; silence does not prove it.

## Risks / Trade-offs

- [Overbroad suppression hides failures] → use only an internal already-reported identity and test an unrelated unexpected rejection.
- [Diagnostics leak exception data] → allowlisted fields and hostile-input subprocess assertions; no raw object serialization.
- [More specific categories require small stage tracking] → track only actual failing operations, without a new framework.
- [Local transport differs from provider presentation] → keep exact-SHA Railway receipt as incomplete post-merge evidence.

## Migration Plan

No data migration. Complete repository implementation and validation, stop for review, and publish only when authorized. Deployment remains separately gated. After deployment prove the exact revision and inspect natural logs. If regressions occur, propose reverting the application change through the normal review/deployment workflow; this proposal grants no rollback mutation authority.

## Dependencies and Operational Gates

Implementation depends only on existing Bun/TypeScript and test tooling; Mongo integration tests require disposable loopback MongoDB. Read-only provider work requires the applicable reviewed operational reference. No credential access, provider write, deployment, or production trigger is authorized by this change. The original hidden production exception remains unknown until fresh diagnostics are observed.
