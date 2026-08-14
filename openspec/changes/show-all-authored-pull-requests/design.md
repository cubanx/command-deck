## Context

See `proposal.md` for motivation. The local dashboard query already joins all installations bound to the signed-in user, author-filters their pull requests, and computes attention from existing evidence. The browser then discards healthy results. Separately, installation verification and shared installation bootstrap stop after the first provider page. Existing conditional reads retain only ETags, which is insufficient to reconstruct an unchanged page during a complete paginated reconciliation. Installation account login is currently discarded during OAuth binding and unchecked during bootstrap and signed-webhook processing.

The active deployment change supplies the current GitHub-deployment dashboard contract. The separate production-operations change owns App installation, deployment, and post-merge verification and remains untouched. Operationally, installation-time OAuth is enabled and the approved `Crisp-Inc` installation `153423118` completed verified binding, but the current callback performs no bootstrap and the default scheduled reconciliation interval is six hours.

## Goals / Non-Goals

**Goals:**

- Correct the selection and rendering boundary so all authorized authored open pull requests remain visible and attention-first.
- Make installation verification and repository/pull-request bootstrap complete across provider pages.
- Apply reconciliation deletions only from a complete authorized snapshot.
- Reject unapproved installation accounts before binding, repository reads, webhook persistence, or projection work.
- Start canonical bootstrap immediately after an approved callback binding while keeping the redirect independent of provider pagination.
- Reuse current identity, authorization, attention, reconciliation, and persistence patterns.

**Non-Goals:**

- Persisting or broadening the GitHub OAuth user token or its scopes.
- Reading repositories outside bound GitHub App installations.
- Changing attention, notification, OpenSpec, or deployment semantics.
- Installing or configuring the GitHub App, deploying, or verifying production.
- Making the GitHub App public or changing its provider-side installation policy.
- Paginating the intentionally bounded recent-deployment feed.

## Decisions

### Render all already-authorized dashboard rows

Remove the browser's attention-only filter. Select only open pull requests in the user-scoped dashboard query, deduplicate by immutable repository ID plus pull-request number after authorization, and sort attention first before the existing recency and number ordering. Render an explicit attention or healthy badge and an authored-open-PR empty message.

This fixes the root cause in the existing shared data path. A separate healthy-PR endpoint or client-side provider query would duplicate authorization and classification logic.

### Paginate the shared bootstrap path before mutation

Use one dependency-free serial page reader for installation-token repository and pull-request lists. Each page keeps the existing authorization header, retry behavior, and conditional request behavior. Collect a complete page set before repository or pull-request upserts and removals; if any page fails, return stale/error without applying that resource's partial snapshot.

Both explicit bootstrap/repair and scheduled reconciliation already call the shared installation bootstrap, so no caller-specific pagination is needed. Deployment reads remain bounded to their existing newest-20 contract.

### Cache conditional page bodies with versioned page keys

Add a nullable cached-response column to the existing ETag store. Successful JSON reads store both ETag and serialized body, while `304` returns reconstructible cached data to the page reader. Paginated repository and pull-request request keys include a new version plus page number so a legacy first-page ETag cannot suppress the initial complete crawl.

Caching bodies is the smallest way to combine complete paginated snapshots with the existing conditional-read contract. Unconditional list reads would weaken that contract, and a new cache table would add structure without buying isolation or correctness.

### Verify only the requested installation across OAuth pages

During OAuth callback, follow the authenticated user's installation pages until the requested numeric installation ID is found or the list is exhausted. Bind only that requested installation when its returned account login matches the exact allowlist, persist that verified login, then discard the user token as today. Do not infer access from organization membership.

### Schedule canonical bootstrap after durable binding

After the verified callback commits the approved installation binding, schedule the existing GitHub App token creation and `bootstrapInstallation` call in a microtask. Track the pending promise in the app instance so tests can await it, while the HTTP callback returns its session redirect immediately. Reuse the canonical bootstrap path rather than adding an endpoint, dashboard action, or callback-specific projection code.

Treat both thrown token failures and returned bootstrap error results as failures. Catch them at the background boundary and log only the fixed operation prefix plus a sanitized message capped at 200 characters. Do not roll back the binding or prior projections; the existing scheduled reconciliation includes the durable installation and remains the recovery path.

### Enforce one exact installation-account allowlist at shared boundaries

Define the three canonical account logins once and compare GitHub logins case-insensitively. Require the shared binding helper to receive and validate account login. Before bootstrap reads repository metadata, use the installation token to read the authoritative installation account and validate it; a missing local login may be backfilled only from that response. Known unapproved installations stop before provider metadata reads.

For signed webhooks, validate `installation.account.login` after signature verification but before durable intake, then revalidate during projection so legacy or directly queued payloads cannot bypass the boundary. Dashboard queries include only installations with approved verified account logins. The local demo uses an approved fictional binding shape.

Legacy null or unapproved installation rows and metadata are retained but inert. This avoids destructive cleanup while failing closed; an approved null row becomes active only after bootstrap authoritatively verifies and backfills it.

## Risks / Trade-offs

- [Cached page bodies increase SQLite size] → Store only authenticated list-page JSON in the existing cache and replace it per request key.
- [A page fails after earlier pages succeed] → Keep page collection side-effect-free for projection rows and retain the prior complete snapshot.
- [The same repository is visible through multiple bound installations] → Authorize each row first, then deduplicate by immutable repository ID and pull-request number, retaining the newest projection.
- [Changed page boundaries can temporarily repeat an item] → Deduplicate the complete page set before applying it.
- [A provider returns malformed pagination metadata] → Advance only through valid next-page links and fail closed on invalid or looping pagination.
- [Legacy installations have no stored account login] → Exclude them from reads and visibility until installation-token verification backfills an approved login; retain their prior rows.
- [A signed delivery bypasses intake through retained queue state] → Revalidate the same allowlist in the shared projection drain before writes, fetches, or notifications.
- [Immediate bootstrap is slow] → Run it after durable binding in a tracked microtask so repository pagination cannot delay the OAuth redirect.
- [Immediate bootstrap fails] → Emit sanitized diagnostics, retain the binding and projections, and rely on the existing scheduled reconciliation retry.

## Migration Plan

1. Add the nullable cached-response column through the existing idempotent startup migration pattern.
2. Deploy code normally after review and merge; the first versioned paginated read populates new page keys without trusting legacy first-page ETags.
3. Roll back application code if needed; the additive nullable cache column and versioned ETag rows are harmless to the prior version.

Operational installation, publication, deployment, and production evidence remain in the controller-owned production change and are not tasks in this change.
