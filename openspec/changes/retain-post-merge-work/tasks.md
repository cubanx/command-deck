## 1. Proposal review

- [ ] 1.1 Obtain user review of eligibility, archive/default-branch evidence, explicit historical recovery, and the single-PR delivery plan; record the agreed decisions before implementation.
- [x] 1.2 Audit overlapping canonical/active lifecycle contracts and task timing separately from strict validation; record merged-candidate precedence and archive ordering in design.md while preserving unrelated open-PR scenarios.

## 2. Implementation and code review

- [ ] 2.1 Add failing producer regressions for merged retention, unresolved/no-OpenSpec boundaries, explicit recovery, immutable default-branch/archive completion and stale races; verify failures before runtime edits.
- [ ] 2.2 Implement shared eligibility and evidence refresh across webhook, targeted, broad, push and known-PR scheduling paths; pass those regressions including deletion and changed-declaration cases.
- [ ] 2.3 Add failing serving/frontend regressions and implement Post-merge visibility, default filters, disabled merge controls and group-first sorting; verify every current sort mode/direction retains its within-group comparator and invalidation works.
- [ ] 2.4 Run combined retention/conflict integration checks, repository validate:all, diff checks and strict validation for both changes; present the one-PR diff for user code review and resolve findings before publication.

## 3. Verify hosted retention [post-merge]

Prerequisite: the shared PR is verified merged and its exact revision is proven deployed. Obtain applicable operational authorization before provider operations. Proposal/code review does not authorize deployment or data repair.

- [ ] 3.1 Record the verified shared PR merge SHA and successful deployment provenance using approved read-only routes; verify both workstreams are present in that revision.
- [ ] 3.2 Observe an authored merged PR with incomplete explicit post-merge work (PR 143 if still eligible), invoking explicit recovery only with applicable authorization; verify current default-branch progress, Merged label, retained-first ordering and broad-repair persistence.
- [ ] 3.3 Observe affirmative completion removal and unknown-evidence retention without production failure injection; if natural evidence is unavailable keep this task incomplete and record the gap.
