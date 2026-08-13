## 1. Test Contracts and Driver Gate

- [x] 1.1 Add a test-database guard that requires an explicitly isolated non-production MongoDB database and refuses production or ambiguous targets.
- [x] 1.2 Add a guarded Bun integration test for MongoDB connection, idempotent index initialization, and readiness using a disposable isolated local database. `mongodb-memory-server-core` is excluded because its bundled driver is Bun-incompatible.
- [x] 1.3 Write failing storage contract tests for hashed session/OAuth expiry, atomic OAuth-state consumption, webhook inbox identity/retry, provider cache identity, and notification transition uniqueness.
- [x] 1.4 Write failing aggregate contract tests for user isolation, multiple bindings, cross-user installation fan-out, stable-identity deduplication, revision conflicts/retries, incomplete-snapshot preservation, closed-projection removal, and the 12 MiB BSON guard.
- [x] 1.5 Write failing seed-command tests for multiple allowlisted bindings, identical retries, pending-sign-in identity, duplicate/missing records, exact-case allowlist rejection, conflicts, and all-or-nothing writes.

## 2. MongoDB Storage Foundation

- [x] 2.1 Add the Bun-compatible official `mongodb` `6.19.0` dependency, derived URI/database configuration, a cached connection promise, typed collection access, and idempotent indexes following internal-apps' transferable conventions.
- [x] 2.2 Define the bounded user aggregate and stable string provider identities, then implement one revision compare-and-swap mutation helper with bounded retries, sanitized errors, BSON-size validation, and a `ponytail:` comment naming targeted updates as the measured-scale upgrade path.
- [x] 2.3 Implement the independent session, OAuth-state, inbox-delivery, provider-cache, and notification collection operations with the required unique and TTL indexes.
- [x] 2.4 Implement the narrow structured-input binding seed command so it validates the full set before writing, never opens SQLite, emits no secrets, and creates or confirms only the partial user aggregate and bindings.

## 3. Authentication, Binding, and Dashboard Access

- [x] 3.1 Replace SQLite session and OAuth-state operations with the tested MongoDB operations while preserving hashing, expiry checks, one-time state consumption, secure cookies, and transient GitHub OAuth user tokens.
- [x] 3.2 Replace user and installation binding writes with aggregate mutations, including ordinary sign-in completion of a seeded identity without removing or adding bindings.
- [x] 3.3 Replace dashboard reads with a single authenticated user-aggregate read and preserve current user, installation, repository, author, attention, OpenSpec, and deployment isolation semantics.

## 4. Provider and Event Projections

- [x] 4.1 Replace provider ETag/cache and reconciliation SQL with complete-snapshot collection plus revision-checked aggregate replacement that leaves the previous projection intact on incomplete or failed refreshes.
- [x] 4.2 Replace webhook inbox and projection SQL with verified-delivery persistence, stable-identity aggregate mutations, deliberate installation-to-users fan-out, idempotent retries, sanitized failure logging, and payload clearing after complete success.
- [x] 4.3 Move active OpenSpec progress and bounded recent deployment projections into their repository entries without reproducing unused relational tables or historical rows.
- [x] 4.4 Replace notification SQL with the user-scoped unique transition collection and preserve recent-dashboard ordering and links.

## 5. Remove the SQLite Runtime

- [x] 5.1 Delete SQLite schema creation, ALTER migrations, SQL helpers, runtime imports, and dead relational storage paths after their MongoDB replacements pass the behavior contracts.
- [x] 5.2 Replace SQLite path and Railway-volume readiness/configuration requirements with MongoDB connection and initialization checks while preserving `/health` as liveness and `/ready` as dependency readiness.
- [x] 5.3 Update environment examples, Docker/Railway configuration, README architecture, security boundaries, reconciliation limits, and operator handoff documentation for MongoDB and the dependent cutover.
- [x] 5.4 Repair the canonical capability deltas for MongoDB, then archive the completed SQLite deployment history with `--skip-specs` so it cannot become authoritative production guidance.
- [x] 5.5 Remove unused dependencies and lockfile entries; retain no ODM, migration framework, dual-store abstraction, or broad GitHub OAuth token storage.

## 6. Validation and Merge Safety

- [x] 6.1 Run the full Bun suite against the guarded isolated MongoDB database, then run repository typecheck and every declared static validation.
- [x] 6.2 Run `git diff --check` and strict OpenSpec validation for `replace-sqlite-with-mongodb`; inspect the final diff for secrets, swallowed exceptions, SQLite runtime remnants, unrelated edits, and untested behavior.
- [x] 6.3 Confirm the `dcc/show-all-authored-pull-requests` worktree remains untouched and record which storage-independent contracts and tests must be reapplied after the MongoDB cutover.
- [ ] 6.4 Obtain current read-only provider evidence that merging this PR cannot automatically deploy the incompatible runtime; if that cannot be proven, leave merge blocked and request a separately authorized pre-merge provider-safety action.
- [x] 6.5 Stop for human review with changed files, validation evidence, remaining gates, and a recommended conventional commit message; do not commit, push, merge, deploy, seed production, or execute the cutover from this change.
