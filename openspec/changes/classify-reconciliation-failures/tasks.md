## 1. Classify reconciliation failures

- [x] 1.1 Add failing tests for finite classifications, hostile exception payloads, validated status/code/target, and runtime stderr.
- [x] 1.2 Preserve safe details across targeted persistence and stage wrappers and sanitize webhook drain logging; verify propagation, failure outcomes, duplicate ownership, and drain recovery with targeted tests.
- [x] 1.3 Run `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun run validate:all`, strict OpenSpec validation, and `git diff --check`; record results and return uncommitted work for review.

## 2. Observe hosted diagnostics [post-merge]

Prerequisite: this implementation has merged and an existing successful production deployment is proven to contain that merge SHA. Any actual deployment mutation requires its reviewed authorization route.

- [ ] 2.1 Record the production project, service, environment, deployment ID, source SHA, and bounded observation window using reviewed safe reads after merge.
- [ ] 2.2 Inspect natural reconciliation or drain failures for safe classification, validated code/status/target when available, and absence of raw payloads; leave receipt incomplete if no natural failure occurs. Do not induce failures or infer root cause from classification alone.
