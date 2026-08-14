## 1. Verified baseline and behavior capture

- [x] 1.1 Record Internal Apps HEAD `1a102a492d8f1de692023d977afb9d48c00d9457`, Biome `2.5.6`, CrapTS `0.1.1`, Vitest/V8 coverage `4.1.10`, formatter/linter rules, CRAP `max 30`/`limit 20`, applicable exclusions, and every omitted repository-specific Quality CI check in contributor documentation.
- [x] 1.2 Capture the current Bun test baseline and add focused preservation assertions for public shell routes/content types/cache headers, service-worker exclusions, authenticated route isolation, webhook verification, and the completed deployment-ordering behavior.
- [x] 1.3 Verify the existing Docker build includes every proposed separated browser asset and document the exact packaging adjustment without changing runtime behavior.
- [x] 1.4 Run the existing focused/full tests, typecheck, strict validation for both PR-owned changes, and diff check.

Checkpoint: stop for user review after Group 1.

## 2. Pinned quality and coverage toolchain

- [x] 2.1 Add exact pinned project dependencies for Biome `2.5.6`, CrapTS `0.1.1`, Vitest `4.1.10`, and `@vitest/coverage-v8` `4.1.10`, preserving frozen-lockfile installation.
- [x] 2.2 Add the portable Biome contract with Git ignore awareness, authored-source scope, tabs, double quotes, import organization, recommended linting, and only narrow generated/binary/license-asset exclusions that exist here.
- [x] 2.3 Migrate all 11 test files from `bun:test` to Vitest, retain non-concurrent test semantics, configure V8 `coverage-final.json`, and prove the same tests and Mongo isolation pass under the one new runner.
- [x] 2.4 Add local `format`, `lint`, `check`, `test:coverage`, `check:crap`, and aggregate `quality` scripts; run CrapTS diagnostically at `max 30`/`limit 20` without lowering thresholds or adding broad suppressions.
- [x] 2.5 Run the migrated suite, coverage generation, Biome diagnostics, CrapTS diagnostics, typecheck, strict OpenSpec validation, and diff check.

Checkpoint: stop for user review after Group 2 with the exact remaining mechanical/complexity violations visible.

## 3. Reviewable browser shell and source cleanup

- [x] 3.1 Extract authored HTML, CSS, browser JavaScript, manifest, and service worker into one small browser-source directory and serve them with Node-compatible file primitives through the existing Bun routes.
- [x] 3.2 Preserve exact public paths, content types, cache headers, shell versioning, installability, adaptive icons, CC attribution, and service-worker exclusions; update Docker packaging for the separated assets.
- [x] 3.3 Apply Biome mechanically to applicable authored files, then split dense server, GitHub, reconciliation, and webhook responsibilities only where required for reviewability or strict CrapTS compliance, reusing shared helpers and preserving Group 2 behavior.
- [x] 3.4 Eliminate every applicable strict Biome and CrapTS violation without blanket ignores, threshold reductions, or behavior changes; document any narrow exception and its removal condition.
- [x] 3.5 Run focused shell/GitHub/webhook/deployment tests, the full migrated suite, coverage, strict CrapTS, Biome check, typecheck, Docker build, strict OpenSpec validation, and diff check.

Checkpoint: stop for user review after Group 3.

## 4. Quality CI and PR #8 handoff

- [x] 4.1 Add a dependency-cached Quality CI workflow that installs from the frozen lockfile and runs the same Biome, strict CrapTS coverage, typecheck, and test gate as local `quality`.
- [x] 4.2 Add the applicable Docker build validation without copying Internal Apps environment, React/Vite, generated-route, component/E2E, classification, deployment, or provider-specific jobs.
- [x] 4.3 Document local Mongo prerequisites, quality commands, formatting workflow, exclusions, thresholds, and the distinction between repository CI files and separately authorized provider-side required-check configuration.
- [x] 4.4 Run the complete local quality gate, Docker build, strict validation for `establish-code-quality-safety` and `improve-command-deck`, and `git diff --check`; confirm no product behavior, provider, permission, deployment, or production mutation occurred.
- [x] 4.5 Mark this change complete and unblock `improve-command-deck` Group 3 only after user review.

Checkpoint: stop for final quality-foundation review before resuming Command Deck feature implementation or performing any commit, push, pull-request, provider, deployment, or production action.
