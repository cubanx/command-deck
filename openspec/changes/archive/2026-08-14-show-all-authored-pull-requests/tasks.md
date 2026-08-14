## 1. Focused tests first

- [x] 1.1 Add dashboard-query tests for multiple bound installations, attention-before-healthy ordering, explicit open-state filtering, stable-identity deduplication, and other-user/unbound-installation isolation.
- [x] 1.2 Add GitHub-client tests for paginated repository and pull-request reads, installation authorization on every page, cached `304` pages, complete-snapshot deletion, and later-page failure preservation.
- [x] 1.3 Add server tests for finding the requested installation beyond the first OAuth page and rendering all authored open pull requests with explicit attention/healthy and empty states.
- [x] 1.4 Add focused callback tests proving successful bind-plus-bootstrap redirects promptly and bootstrap failure preserves the durable binding for reconciliation recovery with sanitized diagnostics.

## 2. Complete provider reads

- [x] 2.1 Extend the existing ETag cache and conditional read path with reconstructible JSON page bodies and versioned page keys.
- [x] 2.2 Paginate the shared installation-token repository and open-pull-request bootstrap path, deduplicate page results, and apply removals only after a complete snapshot.
- [x] 2.3 Paginate OAuth installation verification until the requested installation is found or the authorized list is exhausted, without persisting the user token.
- [x] 2.4 Schedule the existing canonical installation-token bootstrap directly after successful callback binding, track it for deterministic tests, and sanitize background failures without rolling back the binding.

## 3. Show all authorized authored pull requests

- [x] 3.1 Select only open pull requests across every bound installation, preserve author and installation isolation, deduplicate by stable GitHub identity, and order attention-needed rows first.
- [x] 3.2 Remove the browser attention-only filter, render explicit attention/healthy state, and replace the misleading healthy message with an authored-open-PR empty state.
- [x] 3.3 Update user-facing repository documentation to describe the all-authored-PR dashboard and unchanged GitHub App scope.

## 4. Approved installation accounts

- [x] 4.1 Add focused tests for all three approved installation accounts and rejection of arbitrary or missing accounts at binding, bootstrap/reconciliation, webhook intake/projection, and dashboard isolation boundaries.
- [x] 4.2 Define the exact shared installation-account allowlist and enforce it before binding or exposing installation-scoped dashboard data.
- [x] 4.3 Verify and backfill approved installation accounts before bootstrap/reconciliation metadata reads, leaving null or unapproved legacy rows inert.
- [x] 4.4 Reject or ignore missing/unapproved installation accounts before webhook persistence and revalidate before projection work.

## 5. Validation

- [x] 5.1 Run the focused access, GitHub-client, GitHub-events, and server tests.
- [x] 5.2 Run the full test suite, TypeScript check, and diff whitespace check.
- [x] 5.3 Strictly validate `show-all-authored-pull-requests` and confirm the separate production-operations artifacts and evidence remain unchanged.
- [x] 5.4 Rerun focused and full tests, TypeScript, diff, and strict OpenSpec validation after callback bootstrap integration.
