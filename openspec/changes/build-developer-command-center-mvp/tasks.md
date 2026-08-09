## 1. Runtime and persistence foundation

- [x] 1.1 Add the minimal Bun/TypeScript manifest, scripts, environment example, ignore rules, and runtime configuration validation.
- [x] 1.2 Add SQLite schema initialization for users, hashed sessions, installation bindings, provider projections, inbox deliveries, ETags, OpenSpec progress, and user-scoped notifications.

## 2. Developer access

- [x] 2.1 Write failing tests for OAuth state handling, hashed sessions, installation binding, expiration, and cross-user dashboard isolation.
- [x] 2.2 Implement GitHub OAuth identity callbacks, opaque session cookies, installation setup binding, authenticated request helpers, and isolated dashboard reads.

## 3. Durable event projections

- [x] 3.1 Write failing tests for GitHub HMAC verification, delivery deduplication, restart recovery, supported PR/check/review/workflow transitions, ignored events, and notification dedupe.
- [x] 3.2 Implement the SQLite-backed webhook inbox, fast acknowledgement routes, startup drain, GitHub projection handlers, sanitized failures, and post-success payload clearing.
- [x] 3.3 Write failing tests for Railway route-token/shape rejection, pending hints, authoritative deployment reconciliation, and the no-notification-until-verified invariant.
- [x] 3.4 Implement Railway hint ingestion and targeted read-only Public API verification.

## 4. Provider reads and OpenSpec progress

- [x] 4.1 Write failing tests for installation-token reads, serial conditional requests, ETag `304` handling, bounded rate-limit backoff, and explicit stale/error results.
- [x] 4.2 Implement the GitHub App JWT/installation client, explicit bootstrap/repair entry points, conditional metadata, and infrequent serial reconciliation.
- [x] 4.3 Write failing tests for committed OpenSpec checkbox parsing, targeted push-path selection, deletion, installation scoping, and completion transitions.
- [x] 4.4 Implement targeted committed OpenSpec artifact fetching and progress projection without a second workflow engine.

## 5. Command center and installable client

- [x] 5.1 Write failing route/asset tests for authenticated snapshots and SSE isolation, focus/empty/error states, PWA metadata, and safe service-worker caching boundaries.
- [x] 5.2 Implement the compact responsive dashboard, semantic status presentation, authenticated SSE refreshes, permission-based active-client notifications, manifest, icons, and public-shell service worker.

## 6. Local review gates

- [x] 6.1 Document local setup, trust boundaries, provider permissions, API-budget behavior, MVP limits, and the explicit no-deployment/no-live-configuration gate.
- [x] 6.2 Run formatting, type checking, the full Bun test suite, and strict OpenSpec validation; fix any local failures and record all tasks complete.
