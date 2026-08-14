## Context

The current active `operate-developer-command-center-production` change was written for the SQLite runtime, persistent Railway volume, and PR #2 deployment sequence. None of its 11 operational tasks has been executed. The MongoDB foundation replaces those assumptions and deliberately contains no general migration path.

The application has one user and is not in active use, so downtime has no business cost. The only durable state worth carrying forward is the user's verified GitHub App installation binding set. Current ordinary sign-in creates identity and a session but does not rediscover bindings; the existing installation flow can return an installation ID but would require another interactive setup click. The foundation therefore provides a narrow seed operation.

See `proposal.md` for scope and `specs/mongodb-cutover-operations/spec.md` for the operational contract.

## Goals / Non-Goals

**Goals:**

- Make the MongoDB cutover the only actionable production plan.
- Preserve all existing installation bindings without reinstalling the GitHub App.
- Rebuild every provider-owned projection from GitHub rather than SQLite.
- Keep every production mutation separately authorized, reversible where practical, and evidenced.
- Prefer a stopped, one-way cutover over availability machinery.

**Non-Goals:**

- Preserve sessions, caches, webhook history, notifications, provider projections, or any other SQLite content.
- Keep the service available during cutover.
- Add application code, migration tooling, dual writes, reverse synchronization, or a second code PR.
- Delete the SQLite volume or MongoDB database.
- Apply or partially reuse the stale SQLite operational tasks.

## Decisions

### Retire the stale operation without publishing it

Before production access, archive `operate-developer-command-center-production` as superseded with spec synchronization skipped, preserving its record without promoting SQLite-specific deltas. Its unchecked tasks remain evidence that the operation was never executed, not work to be folded into this cutover.

If the OpenSpec tooling cannot preserve that distinction clearly, stop for review instead of leaving two active plans.

### Gate on the exact MongoDB merge SHA

The cutover begins from a fresh current-`main` verification. The merge commit must contain the completed foundation artifacts, implementation, tests, and reviewed seed command. PR state and branch ancestry are insufficient. The verified SHA becomes the only deployment source accepted by the operation.

### Use the production brokers and fail closed

Railway and MongoDB reads or mutations run only through their approved production shells after fresh task-scoped approval. The preflight resolves exact project, environment, service, database, deployed revision, source trigger behavior, credential destination, network rules, and rollback revision before mutation. Provider hints are not evidence.

Automatic deployment is checked again even though the foundation PR has its own pre-merge safety gate. If the service already deployed an unexpected revision, the cutover stops and treats that as a separate incident rather than normalizing it.

### Stop writes and carry only binding tuples

If an old service exists, stop it or otherwise prove that application and webhook writes are quiescent. Then query SQLite narrowly for:

```text
github_user_id | installation_id | installation_account_login
```

The query returns every binding for exactly one user. Values are non-secret, but evidence records only the user count, binding count, and allowlist result unless exact IDs are needed for interactive confirmation. No database export is created.

All rows are validated as a set before the foundation seed command receives structured input. Account comparison is exact and case-sensitive for `cubanx`, `Crisp-Inc`, and `hudson-law`. Missing rows, additional users, duplicate IDs, conflicts, or unknown accounts stop the cutover.

### Seed before deployment, then sign in once

The target database must be empty or explicitly isolated for this service. The seed command creates one partial user aggregate containing the stable user ID and all validated bindings. It is safe to retry with identical input and rejects conflicts.

After deploying the exact foundation SHA, the user completes ordinary GitHub sign-in. This is an interactive authentication step, not installation or rebinding. The callback fills the current login/avatar and creates a new hashed session while preserving the seeded installations.

### Bootstrap only from installation-scoped GitHub reads

After sign-in, run the canonical bootstrap or reconciliation path for every seeded installation. GitHub App installation tokens repopulate repositories and active projections. SQLite is never consulted again. A missing or unapproved account, inaccessible installation, incomplete refresh, or authorization mismatch blocks activation.

### Prefer rollback over reverse migration

The old SQLite store and prior deployment configuration remain intact throughout the attempt. On failure, restore the prior revision and SQLite configuration, verify readiness, and leave MongoDB data untouched for diagnosis or an idempotent retry. There is no reverse copy because no historical SQLite state was migrated and the application is not in active use.

Storage deletion is deliberately deferred. Cleanup is a separate destructive decision, not the tail end of a successful cutover.

## Risks / Trade-offs

- [The old operation remains misleading] -> Retire it before production access and fail if OpenSpec cannot represent the superseded state cleanly.
- [An automatic deploy could race the plan] -> Require a pre-merge foundation gate and re-check source triggers and deployed SHA before cutover mutation.
- [The narrow SQLite query omits a binding] -> Compare binding counts, require exactly one user, validate every tuple as a set, and stop on ambiguity.
- [The partial seeded user lacks current profile identity] -> Require one normal sign-in before bootstrap or dashboard verification; preserve bindings during the identity upsert.
- [A seed command result is uncertain] -> Make identical retries idempotent and conflicting retries fail closed.
- [Bootstrap can fail after deployment] -> Do not activate; restore prior revision/configuration and retain both stores for diagnosis.
- [Keeping the old volume retains obsolete data] -> Accept the temporary cost; deletion requires separate explicit authorization.

## Migration Plan

1. Verify the exact MongoDB foundation merge SHA on current `main` and its completed checks.
2. Retire the unexecuted SQLite operational change without syncing stale specs.
3. Obtain fresh production authorization and verify Railway, Atlas, source behavior, credentials, network access, target emptiness, and rollback revision.
4. Stop application and webhook writes if an old service is running.
5. Read and interactively confirm the narrow SQLite binding set; validate the exact account allowlist.
6. Seed the binding set idempotently into MongoDB.
7. Configure and deploy the exact verified MongoDB revision.
8. Have the user sign in once, then run canonical installation-token bootstrap for every binding.
9. Run the bounded readiness, security, isolation, reconciliation, webhook, notification, and dashboard checks.
10. Record activation evidence, or restore the prior revision and SQLite configuration and record rollback evidence.

No observation window or automatic storage cleanup follows this operation.
