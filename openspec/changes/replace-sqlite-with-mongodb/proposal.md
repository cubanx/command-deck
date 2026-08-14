## Why

The application is still early enough to replace its raw SQLite persistence before the pending pull-request behavior adds more SQL, migrations, pagination caches, and reconciliation queries that would immediately become throwaway work. MongoDB Atlas also fits the application's user-owned projection model better than a normalized relational translation.

## What Changes

- **BREAKING** Replace the runtime `bun:sqlite` store with the Bun-compatible official MongoDB driver and MongoDB-backed readiness.
- Store each signed-in user's active personal projection as one aggregate document containing identity, bound installations, installation accounts, repositories, open authored pull requests, OpenSpec progress, and bounded recent deployments.
- Keep hashed sessions, hashed OAuth states, webhook inbox deliveries, provider response/ETag cache entries, and notifications in separate collections because they have independent expiry, uniqueness, retry, or history lifecycles.
- Preserve the existing authentication, installation-token provider access, user isolation, authorization, webhook idempotency, reconciliation, notification, dashboard, and OpenSpec behavior contracts.
- Fan one installation's provider events into every bound user's aggregate instead of introducing shared installation, repository, or pull-request collections.
- Use stable provider identities, bounded active projections, and atomic compare-and-update operations for reconciliation and webhook updates.
- Provide a narrow, idempotent maintenance command that can seed one user's existing allowlisted installation bindings from three-field handoff records without reading SQLite itself.
- Do not add an ODM, generic repository framework, dual-store mode, or general SQLite migration path.
- Keep `show-all-authored-pull-requests` paused; reapply its storage-independent contracts and tests from updated `main` after this foundation is deployed and verified.
- Leave Atlas configuration, execution of the narrow existing-binding handoff, deployment, bootstrap, production verification, and rollback to the dependent `operate-developer-command-center-mongodb-cutover` change.

## Capabilities

### New Capabilities

- `mongodb-storage`: Defines the MongoDB user aggregate, independent operational collections, consistency boundaries, bounded projections, and runtime storage requirements.

### Modified Capabilities

- `developer-access`: Removes the obsolete Railway mapping contract while retaining verified GitHub installation-bound access.
- `command-center-dashboard`: Replaces Railway deployment wording with installation-scoped GitHub deployment projections.
- `event-projections`: Replaces Railway hints and verification with signed GitHub deployment projections.
- `transition-notifications`: Defines useful signed GitHub deployment transitions.
- `production-deployment`: Replaces SQLite-volume production requirements with MongoDB connectivity and index readiness.

## Impact

- Replaces `src/db.ts` and the SQLite read/write paths used by authentication, access, provider reconciliation, webhook projection, dashboard reads, OpenSpec progress, deployments, and notifications.
- Adds the official MongoDB driver and removes SQLite from the application runtime path. The direct-driver choice is a documented Bun compatibility exception to internal-apps' Mongoose setup.
- Changes production configuration and `/ready` from Railway-volume/SQLite checks to MongoDB connectivity and initialization checks.
- Invalidates the SQLite-specific implementation in the uncommitted `dcc/show-all-authored-pull-requests` worktree while retaining its behavior contracts, pure helpers, and test intent as read-only evidence.
- Requires the dependent operational cutover change to verify this change's exact merge SHA on current `main` before any production action.
