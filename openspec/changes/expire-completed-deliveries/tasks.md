## 1. Implement completed-delivery retention

- [x] 1.1 Add a failing real-MongoDB regression test proving completed-only expiry for existing records, protection of pending/rejected/recent/undated records, and receipt-lifetime duplicate behavior; observe the intended failure before implementation.
- [x] 1.2 Add the partial 72-hour TTL index through existing initialization; verify repeated initialization and real TTL deletion with `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bunx vitest run test/mongodb.test.ts test/github-events.test.ts`.
- [x] 1.3 Validate integration using `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun scripts/validate-all.ts`, `bun scripts/scan-credential-uris.ts`, `openspec validate expire-completed-deliveries --strict`, and `git diff --check`; record results in this artifact. Audit task timing separately from strict validation.

Prior seven-day validation evidence (2026-09-13; revalidation of the revised 72-hour policy is pending): The regression failed on the missing `processedAt_1` index before implementation. All 26 focused tests passed, including real native TTL deletion and preserved diagnostics for protected records. Full validation passed checks, typecheck, frontend build, coverage, and CRAP (244 functions; none above 30). Existing lint warnings remain. The credential-URI scan, strict OpenSpec validation, and diff checks passed. Tests used isolated guarded databases in a disposable localhost MongoDB 8 container with a one-second TTL monitor; the test also allows the normal sixty-second interval. The container was removed afterward. No production data or configuration was changed. Timing audit: group 1 is pre-merge and complete; only group 2 depends on merge and deployment.

Revised 72-hour validation (2026-09-13): the full validation manifest passes all 279 tests, coverage and complexity checks with no functions above 30. Native MongoDB TTL tests verify 259200-second completed-only retention, payload cleanup and protected records. Strict validation, credential scan and diff checks pass. This supersedes the historical seven-day checkpoint above; production retention verification remains pending.

## 2. Verify production retention [post-merge]

Prerequisites: merged change, exact deployed revision verified, and separately authorized production access. This group does not authorize deployment or deletion.

- [ ] 2.1 After authorized deployment, verify `processedAt_1` has a 259200-second TTL limited to done/ignored, observe old eligible receipts decreasing through native cleanup, and verify protected-status records remain; record deployed SHA and timestamped aggregate evidence without payloads.
