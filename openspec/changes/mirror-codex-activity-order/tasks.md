## 1. Prerequisite and Contract Gate

- [ ] 1.1 Refresh current `main`, record PR #8's exact merge SHA, and prove that merge SHA is an ancestor of `HEAD`; stop if it is not.
- [ ] 1.2 Verify the merged PR #8 baseline provides browser-local file-handle persistence, Configuration selection, permission revalidation, focus/manual refresh, and one exact deterministic ordinary Workflow comparator; reconcile artifacts and stop if any primitive is absent.
- [ ] 1.3 Verify the installed supported Codex `Stop` payload can prove stable session identity, main-thread completion, and working repository without reading rollout/state databases or transcripts; capture sanitized fixtures only.
- [ ] 1.4 Run strict OpenSpec validation against the merged baseline and stop for review before implementation.

## 2. Activity File and Writer

- [ ] 2.1 Add focused failing tests for supported schema parsing, malformed input, version rejection, field allowlisting, and privacy exclusions.
- [ ] 2.2 Implement the minimal version-1 schema and strict parser using existing runtime facilities.
- [ ] 2.3 Add focused failing tests for session deduplication, newest-first updates, generation increments, overlapping writers, lock failure, and interrupted atomic replacement.
- [ ] 2.4 Implement the short-lived `Stop` writer with verified Git repository identity, bounded exclusive locking, and same-directory atomic replacement without a new dependency.
- [ ] 2.5 Run focused tests, full tests, typecheck, diff checks, and strict OpenSpec validation; stop for review.

## 3. Browser-Local File Ingestion

- [ ] 3.1 Add focused failing tests for Configuration selection, browser-local handle persistence, permission revalidation, permission loss, malformed/unsupported files, and proof that activity input is never sent to hosted APIs.
- [ ] 3.2 Extend PR #8's existing Configuration and file-handle path to read the activity file and retain only the last valid complete generation in memory.
- [ ] 3.3 Add focused failing tests for `FileSystemObserver` feature detection, observed updates, tab-focus fallback, explicit manual refresh, and observer/read errors.
- [ ] 3.4 Implement observer-based refresh as progressive enhancement while retaining focus and manual refresh paths.
- [ ] 3.5 Run focused tests, full tests, typecheck, diff checks, and strict OpenSpec validation; stop for review.

## 4. Correlation and Ordering

- [ ] 4.1 Add focused failing tests for canonical repository plus PR/branch correlation, cross-repository branch collisions, unmatched records, ambiguous records, and visible diagnostics.
- [ ] 4.2 Implement fail-closed repository-scoped correlation by reusing the merged baseline's canonical repository identity.
- [ ] 4.3 Add focused failing tests for optional `Codex activity` sorting, repeated-session recency, unmatched deterministic fallback, unavailable-input fallback, and unchanged default ordering.
- [ ] 4.4 Implement `Codex activity` ordering by composing record position with the exact merged PR #8 Workflow comparator.
- [ ] 4.5 Run focused tests, full tests, typecheck, diff checks, and strict OpenSpec validation; stop for review.

## 5. Reviewable Setup and Final Validation

- [ ] 5.1 Add an example global `Stop` hook stanza, temporary-file validation command, privacy field list, troubleshooting guidance, and removal steps without touching `~/.codex/hooks.json`.
- [ ] 5.2 Add an automated check that repository tests and setup validation use temporary destinations and never install or mutate global Codex hooks.
- [ ] 5.3 Run the complete repository validation suite and `openspec validate mirror-codex-activity-order --strict`.
- [ ] 5.4 Review the final diff for dependency, privacy, browser-local, PR #8 ownership, and no-external-mutation boundaries; stop for user review without committing, pushing, deploying, or installing hooks.
