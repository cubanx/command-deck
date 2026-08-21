PR #8 handoff dependency: this entire operational change remains blocked until intended PR #8 is merged, its exact merge SHA is verified on updated current `main`, and that exact code is deployed and healthy. Recording this dependency is not operational authorization.

## 1. Verify blocked prerequisite

- [x] 1.1 Verify intended PR #8 is merged and record its exact merge SHA from GitHub.
- [x] 1.2 Update current `main` and prove the exact merge SHA is an ancestor without local divergence.
- [x] 1.3 Verify the deployed revision equals or contains that exact SHA and capture task-specific health evidence.
- [x] 1.4 Confirm no Merge action is rendered before permission approval.

Gate: do not begin this group or any later group before PR #8 merge, exact-current-main ancestry, deployed revision, and health all pass. Each provider or production read requires its applicable authorization.

## 2. Prove and approve minimum permission

- [ ] 2.1 Inspect the merged implementation and capture redacted evidence for its exact GraphQL operation, expected-head input, merge method, and current permission failure.
- [ ] 2.2 Prove that Pull requests write is sufficient and Contents write is unnecessary; stop for a new decision if evidence is ambiguous or broader.
- [ ] 2.3 Obtain fresh task-scoped authorization and update only the GitHub App Pull requests permission.
- [ ] 2.4 Verify the App permission diff and rollback path without changing installation accounts or repository selection.

## 3. Approve intended installations

- [ ] 3.1 Enumerate and verify only the intended currently allowlisted installation accounts and repositories.
- [ ] 3.2 Obtain separate approval for updated permissions on each intended installation account.
- [ ] 3.3 Verify eligible pull requests on approved installations show Merge while unapproved or ineligible cards render no Merge action, with strict user isolation.

## 4. Deploy and verify configuration

- [ ] 4.1 Obtain fresh authorization for any required production deployment or configuration action and verify the exact deployed revision.
- [ ] 4.2 Verify authenticated user-role proof, installation binding, exact-head, policy, OpenSpec, sanitized error, and disabled-capability paths without merging.
- [ ] 4.3 Capture rollback/repair commands and evidence for application configuration, deployment, App permission, and installation approval.

## 5. One authorized safe merge proof

- [ ] 5.1 Select one explicitly approved low-risk pull request and capture repository, number/title, signed-in user role, exact head SHA, `MERGE` method, protections/rulesets, checks, reviews, mergeability, and completed OpenSpec evidence immediately before action.
- [ ] 5.2 Obtain fresh task-scoped authorization naming that repository, pull request, exact head SHA, merge method, and mutating merge.
- [ ] 5.3 Execute at most one guarded merge through Command Deck and capture redacted provider result plus immediate refreshed state.
- [ ] 5.4 On any drift or refusal, perform no retry or alternate credential path and record the failed gate.

## 6. Redacted evidence and closure

- [ ] 6.1 Exercise or review the disabled-capability rollback and any necessary separately authorized permission/install repair.
- [ ] 6.2 Remove credentials, tokens, raw provider payloads, and sensitive identifiers from the evidence packet.
- [ ] 6.3 Strictly validate this OpenSpec and mark it complete only after every authorized operational gate and rollback/repair proof passes.

This operational change requires no code pull request. This artifact authorizes none of its external reads or mutations.
