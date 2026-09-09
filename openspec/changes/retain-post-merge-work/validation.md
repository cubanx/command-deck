# Group 2 local evidence

Base: draft PR #25 at `94434e108c032f8705905172c1ed6353ad22fe73`, branch `cd/resolve-aggregate-conflicts`. Both changes form one implementation for the shared PR; this evidence was collected before publication. No publication, deployment, historical repair, or hosted observation occurred.

## Implementation

- Retain authored merged work with explicit incomplete follow-up or unresolved declared evidence. Preserve enrolled obligations across removed declarations and changed group markers; exclude verified absent/empty declarations and new valid pre-merge-only work.
- Evaluate declared/enrolled changes at one immutable current default-branch commit. Accept an active file or exactly one dated archive; require positive, fully checked totals for enrolled completion. Missing, ambiguous, empty, failed task reads, and failed branch/tree reads remain unresolved. Failed branch/tree recovery does not invent a source SHA.
- Webhooks, targeted and broad repair, pushes, and scheduled known-PR repair use the retained-candidate path. Missing records require the provider author to match the bound user. Feature pushes enqueue refresh but cannot provide completion evidence.
- Targeted lifecycle and task projections share one guarded aggregate write. Broad snapshots preserve repositories changed during provider reads, including absence; stable lifecycle and task evidence are applied atomically. This conservative repository guard defers busy repositories to a later refresh.
- Serving and UI include retained work by default and after Clear, show Merged/Post-merge without Draft, and omit the merge action. All five sorting modes preserve their comparator within retained/open groups in both directions.

## Regression evidence

Initial exploratory producer edits preceded some acceptance tests; this record does not claim otherwise. Final retention tests were replayed against an isolated copy of the published proposal revision: five tests failed. Applying the exact runtime diff afterward made those same five pass. The working checkout was not reset for this replay.

- The recovery/eligibility matrix covers invalid, empty and absent declarations, missing and zero-task artifacts, task/branch/tree failures, foreign authors, ambiguous archives, and completion of an enrolled archived change.
- Eight projection-invariant tests cover real webhook/task overlap, newer heads, late OPEN/CLOSED reads, older complete/incomplete merged evidence, no resurrection, and broad-list races. Same-author aggregates with different obligations retain a three-slug union even after a declaration and marker change.
- Manual repair covers authorized missing numbers and rejects foreign installation/repository IDs and invalid numbers. Weekday scheduling includes retained work and excludes unrelated closed history.
- UI checks cover default/Clear behavior, Merged without Draft, no merge action, all sort modes/directions, exact within-group order, and repository/search/lifecycle filters.
- Combined producer/overlap run: 69 passed. Five isolated baseline failures became five passes after patch replay.

## Final checkpoint

The required local `validate:all` pipeline passed after the final behavior-preserving complexity refactor: 267 tests across 29 files passed; 244 functions checked, zero above the CRAP limit of 30. Credential scanning, lint, typecheck, and frontend build passed. Log: `/private/tmp/cd-pr25-validation-final.log`.

The user subsequently invoked `commit-and-continue` after the review handoff; publication is authorized and task 2.4 is complete. All Group 3 hosted work remains incomplete and requires the stated merge/deployment evidence and operational authorization.
