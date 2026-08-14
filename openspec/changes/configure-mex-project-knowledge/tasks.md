## 1. Generate and review the canonical scaffold

- [x] 1.1 Verify the current default-branch SHA and execute an official pinned `mex-agent` launcher for its version and repository-mode help without changing `package.json` or `bun.lock`; stop with the exact failure if the supported launcher cannot run.
- [x] 1.2 Run the validated Mex repository setup against the current checkout and capture the complete generated-file inventory before manual curation.
- [x] 1.3 Check every generated claim against repository sources, assign each generated path a committed, ignored, or removed disposition, and verify that application files, deployment inputs, secrets, absolute local paths, and `.codegraph/` are untouched.

Stop after Group 1 for human review of the raw generated scaffold, claim audit, and artifact dispositions. Do not begin Group 2 without approval.

## 2. Retain and validate minimal project knowledge

- [ ] 2.1 Apply the approved dispositions and minimally curate the router plus architecture, stack, conventions, decisions, setup, and reusable-pattern knowledge; add a thin root instruction pointer only if the validated Mex workflow requires it.
- [ ] 2.2 Run the release's native Mex validation command when available, verify all retained routing targets, and execute focused checks for unapproved generated files, secrets, absolute local paths, application dependency changes, deployment-input changes, and `.codegraph/` changes.
- [ ] 2.3 Run `bun run typecheck`, `bun test`, `openspec validate configure-mex-project-knowledge --strict`, and `git diff --check`; document any environment-only limitation without weakening a failed repository check.
