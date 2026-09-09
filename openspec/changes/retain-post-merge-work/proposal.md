## Why

Merged pull requests with unfinished, explicitly designated `[post-merge]` OpenSpec work currently disappear when the webhook projector, targeted reconciliation, or broad bootstrap removes closed records. This hides active follow-up work and lets the dashboard report an empty state even though the committed progress evidence is incomplete.

## What Changes

- Retain merged authored pull requests while valid progress evidence shows unchecked tasks in a `[post-merge]` group.
- Reconcile retained records through webhook, targeted, and broad producer paths, preserving them until evidence proves all work complete.
- Treat missing, failed, or ambiguous progress evidence conservatively and never classify it as completed.
- Serve retained post-merge work ahead of open pull requests while preserving the existing comparator within each group.
- Remove retained records only after complete progress evidence is observed.

## Capabilities

### New Capabilities

- `post-merge-work-retention`: Retain and serve merged pull requests with explicitly designated unfinished post-merge work.

### Modified Capabilities

## Impact

Changes the Mongo aggregate projection and GitHub reconciliation paths in `src/events.ts`, `src/github.ts`, and `src/db.ts`, plus dashboard assembly and view-model ordering in `src/access.ts` and `src/features/command-center/view-model.ts`. No provider configuration or deployment operation is included.

## Review and delivery

The user requested one PR containing this change and `resolve-aggregate-conflicts`. Keep their contracts and verification distinct; the PR body must declare both OpenSpecs. Stop for proposal review before implementation, then stop for code review before publication.

Proposed eligibility: retain confirmed incomplete post-merge work and unresolved declared work pending verification. Verified absent/empty declarations with no prior retained obligation do not enroll ordinary merged PRs. Missing evidence never clears an enrolled obligation. Resolve progress against the current default-branch commit, including an unambiguous archive location. Targeted repair can recover an already-removed PR by number; broad repair does not scan unlimited merged history.
