## 1. Reconciliation diagnostics and repository validation

Timing: pre-review. Complete this bounded repository group, then stop for user review without committing or publishing.

- [x] 1.1 Add focused failing regressions for targeted execution and bookkeeping context, unexpected broad failures versus already-reported aggregates, hostile exception content, and real Bun stderr JSON/cardinality; record the red test result before changing behavior.
- [x] 1.2 Repair the shared reconciliation error ownership and serialization boundaries, including asynchronous persistence and server wiring; verify focused tests pass with installation, failing operation/category, safe status, and no raw exception payloads or duplicate aggregate errors.
- [x] 1.3 Verify preserved expected/no-change/recovered-request outcomes, failed-result semantics, continued serial processing, and queue recovery with focused coordinator, provider, and server tests.
- [x] 1.4 Run `bun run typecheck`, the full repository test suite using disposable loopback MongoDB, `openspec validate explain-reconciliation-errors --strict`, and `git diff --check`; record commands and results plus the separate task-timing audit in validation evidence, and leave implementation uncommitted for review.

## 2. Verify hosted diagnostics [post-merge]

Timing: merge-dependent. Prerequisites: reviewed implementation merged, separately authorized deployment, and exact deployed merge SHA or immutable artifact provenance proven for the named Command Deck production service. This group authorizes no deployment, provider mutation, credential access, or manufactured production behavior.

- [ ] 2.1 After the prerequisites, use the reviewed read-only Railway route to record project/service/environment, deployment ID, exact source SHA, and observation window; verify deployed provenance matches this change before attributing logs to it.
- [ ] 2.2 Inspect fresh natural reconciliation logs at that deployment and verify the hosted JSON fields identify installation and failing operation/category, contain no sensitive payloads, and suppress generic/duplicate aggregate errors while unexpected failures remain visible; leave acceptance incomplete if no natural failure provides evidence.
