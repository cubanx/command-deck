## 1. Proposal review

- [ ] 1.1 Obtain user review of process-local per-user coordination, external-writer limits and the single-PR delivery plan; record approval before implementation.

## 2. Implementation and code review

- [ ] 2.1 Audit all aggregate mutation callbacks and direct user-document writers for replay, nesting, result flags and stale replacement; record exact caller evidence and add a deterministic failing four-writer regression using the real mutation helper before editing runtime code.
- [ ] 2.2 Implement the smallest shared per-database/user queue preserving CAS/retry/error contracts; pass overlapping-writer, independent-user, cleanup, rejection, external-conflict, missing-user and size-limit checks.
- [ ] 2.3 Verify targeted, webhook and task-projection overlap with the retention change, including newer-head/merged-state and committed-attempt results; fix only test-demonstrated adjacent defects and present wider changes for review.
- [ ] 2.4 Run the combined repository validation and strict validation for both changes; present the single-PR code diff for user review and resolve findings before publication.

## 3. Observe hosted reconciliation [post-merge]

Prerequisite: the shared PR is verified merged, and successful deployment is bound to that exact revision. Provider access requires the applicable authorization; this proposal authorizes no deployment, failure injection or monitoring automation.

- [ ] 3.1 Record exact merged/deployed provenance and verify the deployed code includes both OpenSpecs' implementation.
- [ ] 3.2 Inspect a finite natural workload window using approved read-only routes; record start/end, truncation limits, successful reconciliation evidence and remaining failure classifications without treating log silence as acceptance.
- [ ] 3.3 Assess whether observed conflicts remain, distinguish same-process mitigation from external-writer limits, and record acceptance or the exact remaining gap; keep incomplete when evidence is insufficient.
