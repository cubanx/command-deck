## 1. Repair and verify the refresh wire contract

- [x] 1.1 Strengthen the existing server SSE coverage to decode the initial and shared fan-out refresh frames, assert exact `event: refresh\ndata: {}\n\n` framing and no literal `\\n`, and verify the focused server test fails before application code changes.
- [x] 1.2 Replace the malformed newline escapes in both existing server refresh writers and verify the focused server test plus the existing frontend named-event query-invalidation test pass without client changes.
- [x] 1.3 Run the full configured suite with `MONGODB_URI_BASE=mongodb://127.0.0.1:27019 bun run test` against a disposable loopback MongoDB, then run `bun run typecheck`, `openspec validate fix-sse-refresh-framing --strict`, and `git diff --check`; stop with no deployment or external mutation if any gate fails.
