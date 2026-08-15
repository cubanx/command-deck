## Context

Current `origin/main` persists all state through raw `bun:sqlite` tables and SQL spread across authentication, access, provider reconciliation, webhook projection, OpenSpec progress, deployments, and notifications. Dashboard reads already begin with the authenticated user and traverse that user's installation bindings. Provider events can target one installation bound to multiple users, and GitHub repository reads already use installation tokens while the OAuth user token remains transient.

The uncommitted `dcc/show-all-authored-pull-requests` worktree adds substantial SQLite-specific pagination, caching, authorization, and reconciliation code. It remains read-only evidence and is not a dependency of this code change.

The `dcc/show-all-authored-pull-requests` worktree was inspected only through `git worktree list`; its branch and files remain untouched. Reapply its storage-independent pagination, allowlist, sorting, and provider-completeness contracts after this MongoDB foundation is merged and cut over; discard its SQLite fixtures and queries.

The completed but unarchived `deploy-developer-command-center` artifacts describe SQLite volume requirements. This design supersedes those storage details; they must not later be archived or executed unchanged. See `proposal.md` for motivation and `specs/mongodb-storage/spec.md` for the behavior contract.

## Goals / Non-Goals

**Goals:**

- Make the signed-in user the physical and logical owner of every personal dashboard projection.
- Preserve current product and security behavior while replacing persistence.
- Keep concurrency, deduplication, and failure recovery explicit despite the small deployment.
- Leave one tested operational seam for the later three-field binding handoff.
- Keep the implementation small enough to review as a focused foundation PR.

**Non-Goals:**

- Implement any pending `show-all-authored-pull-requests` behavior.
- Migrate general SQLite data, preserve current sessions, or support dual stores.
- Configure Atlas, deploy, seed production, bootstrap production, or delete the SQLite volume.
- Add an ODM, schema framework, generic repository layer, shared provider aggregates, or speculative bucket collections.
- Optimize uptime or high write throughput.

## Decisions

### Use the Bun-compatible MongoDB driver exception

Adopt internal-apps' transferable connection conventions: `MONGODB_URI_BASE` plus a derived `MONGODB_DATABASE`, a cached connection promise keyed by URI and database with a five-second server-selection timeout and rejection cache clearing, and idempotent index initialization. DCC uses the official MongoDB driver `6.19.0` directly because Mongoose `8.24.0` fails at direct import under the pinned Bun runtime. This is a documented runtime compatibility exception, not a new storage abstraction.

Before broader conversion, a failing integration test will prove the chosen driver version works under the repository's pinned Bun runtime against an isolated non-production MongoDB database.

### Store one bounded document per user

Provider IDs are stored as strings to avoid JavaScript numeric precision assumptions. The aggregate shape is:

```ts
type UserAggregate = {
  _id: string; // GitHub user ID
  schemaVersion: 1;
  revision: number;
  github: {
    login?: string; // absent only for a cutover seed awaiting sign-in
    avatarUrl?: string;
  };
  installations: Array<{
    installationId: string;
    accountLogin: string;
    boundAt: Date;
    lastSuccessfulSyncAt?: Date;
    repositories: Array<{
      repositoryId: string;
      owner: string;
      name: string;
      fullName: string;
      pullRequests: Array<OpenAuthoredPullRequestProjection>;
      openSpec?: ActiveOpenSpecProjection;
      deployments: Array<RecentDeploymentProjection>;
    }>;
  }>;
  createdAt: Date;
  updatedAt: Date;
};
```

Repositories stay embedded even if an installation is bound to multiple users. Fan-out duplicates provider facts intentionally so every authorization-sensitive read remains a single-user read.

Only open authored pull requests, active OpenSpec state, and the existing finite deployment window remain embedded. Before replacement, BSON size is calculated and rejected at a fixed 12 MiB application ceiling, leaving headroom below MongoDB's 16 MiB limit. If production ever hits that ceiling, the upgrade path is user-owned repository bucket documents; building them now would be speculative.

### Keep five independent operational collections

```text
sessions           _id=tokenHash, userId, expiresAt
oauth_states       _id=stateHash, createdAt, expiresAt
inbox_deliveries   _id=provider:deliveryId, payload, status, attempts, retry fields
provider_cache     _id=requestKey, etag, optional response body, updatedAt
notifications      userId, transitionKey, message/link fields, createdAt
```

Required indexes are:

- `users`: the built-in unique `_id`; multikey `installations.installationId` for trusted webhook fan-out.
- `sessions`: TTL on `expiresAt` in addition to `_id` token-hash lookup.
- `oauth_states`: TTL on `expiresAt` in addition to `_id` state-hash lookup.
- `inbox_deliveries`: unique `_id`; `{ status: 1, nextAttemptAt: 1 }` for bounded retry draining.
- `provider_cache`: unique `_id` request key.
- `notifications`: unique `{ userId: 1, transitionKey: 1 }`; `{ userId: 1, createdAt: -1 }` for recent history.

Notifications stay separate because trimming an embedded display window would otherwise weaken durable transition deduplication. Provider response bodies remain optional until a storage-independent pagination contract needs them.

### Use whole-aggregate compare-and-swap

One shared mutation helper loads a user aggregate, applies a deterministic in-memory change keyed by stable provider IDs, validates the result and BSON size, then replaces it with a filter on `_id` and the previously read `revision`. A revision mismatch reloads current state and retries a small bounded number of times. Exhaustion is an error with sanitized diagnostics, never a silent fallback.

This is simpler and safer than spreading nested positional-update expressions through every projector at current scale. It writes more bytes per event; a `ponytail:` comment will name targeted positional updates as the upgrade path if measured write amplification matters.

Reconciliation collects every response required by the current provider contract before the compare-and-swap. A failed or incomplete refresh leaves the previous aggregate untouched. Webhook fan-out queries users by `installations.installationId`, mutates each aggregate idempotently, and marks the inbox delivery complete only after every bound user update succeeds.

### Keep authentication and trust boundaries unchanged

Sessions and OAuth states are addressed by their hashes. Application expiry checks remain mandatory because TTL deletion is asynchronous. OAuth state consumption uses one atomic read-and-delete. The transient OAuth user token may verify the user and the requested installation but is never persisted; provider projection reads continue to mint installation tokens.

All authenticated reads address the user by verified session user ID. The installation multikey index is used only after webhook signature verification or another trusted installation-scoped operation.

### Provide a narrow seed command, not a migrator

A one-purpose maintenance command reads structured handoff records, validates all records before writing, and atomically creates or confirms one partial aggregate with the listed bindings. It accepts one user ID and any number of distinct installation-ID/account-login pairs, using the exact three-account allowlist. It never opens SQLite, stores historical projections, or overwrites a conflicting binding.

The partial aggregate intentionally lacks current GitHub profile fields until the user signs in. The ordinary sign-in upsert must fill identity fields without replacing the seeded installation array. Production execution belongs exclusively to the dependent cutover change.

### Make readiness depend on MongoDB

Startup validates the MongoDB URI base and database name, connects through the cached MongoDB client, and verifies the connection before reporting ready. `/health` remains process liveness. `/ready` fails when database connection or required initialization fails. SQLite path and Railway volume checks leave the runtime and deployment documentation.

### Preserve tests as behavior contracts

Projection transforms remain pure where practical. Existing behavior tests are rewritten to assert user-visible and security outcomes rather than SQL rows. A small real-database contract suite covers unique identities, TTL index definitions, atomic OAuth consumption, revision conflicts, fan-out, inbox completion, notification deduplication, seed idempotency, and readiness. The suite requires an explicitly isolated non-production database and fails closed if pointed at production.

## Risks / Trade-offs

- [Whole-document replacement increases write amplification] -> Keep the aggregate bounded, measure BSON size, document the targeted-update upgrade path, and do not optimize before evidence.
- [A repository-heavy user can approach MongoDB's document limit] -> Enforce the 12 MiB application ceiling and split into user-owned repository buckets only if the guard is reached.
- [Webhook and reconciliation updates can race] -> Use revision compare-and-swap, bounded retries, complete snapshots, and idempotent stable identities.
- [TTL cleanup is not immediate] -> Enforce expiry in application reads and use TTL only for cleanup.
- [A seeded user is temporarily incomplete] -> Permit no dashboard session until verified sign-in fills identity; preserve seeded bindings during that upsert.
- [The completed deployment artifacts still describe SQLite] -> Repair this change's canonical capability deltas, then archive the completed SQLite history with `--skip-specs` so it remains historical rather than authoritative.
- [Driver behavior under Bun could differ from Node.js] -> Make the real-database Bun compatibility test the first implementation gate.

## Migration Plan

This PR performs no production migration or deployment.

1. Implement and validate the MongoDB runtime against an isolated non-production database.
2. Remove SQLite from application runtime behavior while retaining no import path.
3. Before merge, obtain current evidence that merging `main` cannot automatically deploy this incompatible runtime. If that cannot be proven, leave the PR blocked and create an explicitly authorized pre-merge provider-safety action.
4. Merge only the reviewed code and OpenSpec artifacts.
5. Hand the exact merge SHA to `operate-developer-command-center-mongodb-cutover`; do not deploy from this change.

Code rollback before deployment is ordinary Git reversal. Production rollback is defined only by the dependent operational change.
