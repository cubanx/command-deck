## 1. Local OAuth development

- [x] 1.1 Add tests first for an explicit loopback local callback origin and non-secure development cookie; verify `bunx vitest run test/config.test.ts` and the focused local OAuth server test pass.
- [x] 1.2 Implement loopback-only non-production `PUBLIC_URL`, OAuth callback/redirect, and cookie behavior while retaining hosted validation; verify malformed and non-loopback origins are rejected by configuration tests.
- [x] 1.3 Document existing local 1Password Environment injection for real-provider development without resolving or storing secrets; verify docs and local OAuth configuration tests describe the approved path.

## 2. Bounded provider reconciliation

- [x] 2.1 Add timeout and reconciliation-lock-release tests before the provider change; verify the focused GitHub client and Mongo-backed server tests pass.
- [x] 2.2 Route server-side GitHub requests through the shared bounded request path and set the server idle window; verify timeout diagnostics, later reconciliation recovery, and the idle-window source contract test pass.

## 3. Varlock configuration contract

- [x] 3.1 Add Varlock and `@varlock/1password-plugin`, then replace `.env.example` with `.env.schema`; verify dependency installation and focused schema contract tests pass.
- [x] 3.2 Configure `.env.schema` to mark ambient `OP_SERVICE_ACCOUNT_TOKEN` as sensitive, internal `opServiceAccountToken`, bulk-load only non-credential `dev-command-center-local-development` values, and resolve the four omitted GitHub credentials from their exact canonical item references; verify `varlock run` loads without `.env`, raw values, extra `op://` references, or desktop/human authentication.

## 4. Canonical local validation

- [x] 4.1 Add Varlock load and scan steps to canonical local validation and documentation using `varlock run` with ambient Local Automation authentication; verify focused quality-contract tests assert the command order and Varlock succeeds under the approved local Environment.

## 5. Configuration UI and quality repair

- [x] 5.1 Increase the existing native configuration avatar-menu caret to `1rem` test-first; verify the focused UI/source assertion passes without replacing `details`/`summary` behavior.
- [ ] 5.2 Replace identified Biome explicit-`any` baseline sites with precise existing types and no broad suppressions; verify `bun run check` reports no Biome errors.
- [ ] 5.3 Align the two stale logging tests with the current visible sanitized diagnostic contract; verify their focused tests pass and still reject raw provider values.
- [ ] 5.4 Add tests first for Closest-to-merge pull-request number ascending; verify equal-state cards order lowest number first with repository identity as a deterministic fallback.

## 6. Final verification

- [ ] 6.1 Validate the completed change and repository; verify `openspec validate support-local-command-deck-development --strict` and `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun run validate:all` pass.
