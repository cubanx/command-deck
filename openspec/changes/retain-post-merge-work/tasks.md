## 1. Proposal review

- [x] 1.1 Obtain user review of eligibility, archive/default-branch evidence, explicit historical recovery, and the single-PR delivery plan; record the agreed decisions before implementation.
- [x] 1.2 Audit overlapping canonical/active lifecycle contracts and task timing separately from strict validation; record merged-candidate precedence and archive ordering in design.md while preserving unrelated open-PR scenarios.

Approval record (2026-09-09): after publication of both proposals in draft PR #25 at `94434e108c032f8705905172c1ed6353ad22fe73`, the user invoked `openspec-apply-change`. Treat that instruction to apply the published proposals as acceptance of the documented eligibility, default-branch/archive evidence, explicit recovery and one-PR decisions. Group 2 code review and Group 3 operational prerequisites remain required.

## 2. Implementation and code review

- [x] 2.1 Add failing producer regressions for merged retention, unresolved/no-OpenSpec boundaries, explicit recovery, immutable default-branch/archive completion and stale races; verify failures before runtime edits.
- [x] 2.2 Implement shared eligibility and evidence refresh across webhook, targeted, broad, push and known-PR scheduling paths; pass those regressions including deletion and changed-declaration cases.
- [x] 2.3 Add failing serving/frontend regressions and implement Post-merge visibility, default filters, disabled merge controls and group-first sorting; verify every current sort mode/direction retains its within-group comparator and invalidation works.
- [x] 2.4 Run combined retention/conflict integration checks, repository validate:all, diff checks and strict validation for both changes; present the one-PR diff for user code review and resolve findings before publication.

Code review checkpoint (2026-09-09): after the combined implementation and passing validation were presented for review, the user invoked `commit-and-continue`, authorizing publication and continuation. No user findings were supplied. Group 2 is complete; Group 3 still requires verified merge/deployment evidence and operational authorization.

## 3. Verify hosted retention [post-merge]

Prerequisite: the shared PR is verified merged and its exact revision is proven deployed. Obtain applicable operational authorization before provider operations. Proposal/code review does not authorize deployment or data repair.

- [ ] 3.1 Record the verified shared PR merge SHA and successful deployment provenance using approved read-only routes; verify both workstreams are present in that revision.
- [ ] 3.2 Observe an authored merged PR with incomplete explicit post-merge work (PR 143 if still eligible), invoking explicit recovery only with applicable authorization; verify current default-branch progress, Merged label, retained-first ordering and broad-repair persistence.
- [ ] 3.3 Observe affirmative completion removal and unknown-evidence retention without production failure injection; if natural evidence is unavailable keep this task incomplete and record the gap.
