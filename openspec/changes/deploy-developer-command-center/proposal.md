## Why

The merged MVP has no reproducible production deployment contract, so its SQLite durability, public callback URLs, provider credentials, and readiness behavior cannot yet be operated safely on Railway. This change defines and implements the smallest production configuration, then preserves external setup and verification as evidence-gated operational work.

## What Changes

- Add a pinned Bun container build and Railway service configuration for one service with one persistent volume.
- Make the production origin, database path, proxy behavior, and required secrets explicit and fail closed when inconsistent.
- Document the personal GitHub App's least-privilege permissions, events, OAuth callback, webhook URL, and installation-token contract.
- Document server-side Railway connection mappings, untrusted webhook hints, health/readiness gates, rollback, and bounded production verification.
- Separate repository implementation tasks from external mutations and leave production tasks incomplete until their exact evidence exists.

## Capabilities

### New Capabilities

- `production-deployment`: Reproducible Railway hosting, durable SQLite storage, public provider endpoints, configuration validation, operational gates, rollback, and evidence-based production verification.

### Modified Capabilities

None.

## Impact

This affects the service startup/configuration path, deployment files, configuration tests, and operator documentation. It introduces no application service, database, queue, or runtime dependency; external GitHub, Railway, and 1Password state remains unchanged until separately authorized.
