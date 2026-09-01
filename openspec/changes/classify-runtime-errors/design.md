## Context

Push projection currently flattens commit file lists and fetches every non-removed task path at the push's final SHA. Merge topology can therefore produce a `404` for a path changed only in an intermediate tree. The same status can mask authorization or provider failures, so `404` alone is not deletion evidence. Reconciliation already retries bounded request-level failures and retains sanitized evidence, but terminal errors lose their structured GitHub context and are logged twice. The snapshot endpoint already returns an unauthenticated `401` without a server error; the single-request browser loader turns that expected response into a console error.

## Goals / Non-Goals

**Goals:**

- Classify only positively proven final-tree absence as expected while preserving durable retry for ambiguous failures.
- Preserve structured, sanitized GitHub failure context through installation reconciliation and log each terminal failure once.
- Keep signed-out snapshot loading to one request and one visible signed-out state without an application error.

**Non-Goals:**

- Inferring deletion from `404`, changing authentication, adding whole-installation retries, or changing provider retry limits.
- Redesigning the dashboard, introducing a shared taxonomy framework, adding dependencies, or changing production configuration.

## Decisions

### Verify final-SHA absence with the Git tree API

On a task-content `404`, make one bounded read of the repository tree at the same final SHA with recursive entries. Classify the path as stale only when that request succeeds, its response is valid and explicitly untruncated, and the exact blob path is absent. Preserve the prior projection and continue. Any failed, malformed, truncated, or contradictory tree response leaves the original `404` ambiguous and fails through the existing inbox retry path.

This uses GitHub's authoritative final tree instead of replaying incomplete webhook commit topology. Treating every `404` as stale was rejected because GitHub can mask authorization failures; walking commit history was rejected as broader and less direct.

### Preserve the existing structured GitHub failure

Carry the existing sanitized GitHub failure fields through the installation catch path, persist them in reconciliation evidence, and emit one terminal error at the boundary that owns installation identity. The aggregate reconciliation failure remains fail-closed after all approved installations are attempted. A new logger or error hierarchy is unnecessary.

### Special-case only snapshot 401 in the browser loader

Represent the numeric status long enough for the load catch to skip `console.error` only for `401`; render the existing signed-out copy and retain one request. Other statuses and request failures keep the current sanitized log and recovery UI. Server authentication behavior remains unchanged.

## Risks / Trade-offs

- [A large Git tree response can be truncated] → accept absence only when GitHub explicitly reports a complete tree; otherwise fail closed and retry.
- [A stale path adds one provider read] → perform it only after `404`; add caching only if measured stale-path volume warrants it.
- [Structured diagnostics can leak provider data] → reuse the existing sanitized diagnostic fields and assert forbidden raw details are absent.

## Migration Plan

Deploy the code normally after focused and full validation. No data migration or provider mutation is required. Roll back the application revision if expected errors or projection failures regress; retained inbox deliveries and prior projection evidence remain recoverable.
