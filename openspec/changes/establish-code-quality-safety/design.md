## Context

The repository has TypeScript typechecking and tests but no formatter, linter, `.editorconfig`, complexity gate, or general Quality CI workflow. `src/events.ts` and `src/github.ts` contain lines longer than 1,500 and 2,000 characters, respectively, and `src/server.ts` embeds the authored HTML, CSS, browser JavaScript, manifest, and service worker in string literals. The current worktree also contains reviewed OpenSpec artifacts and uncommitted Group 2 deployment-ordering work that must remain behaviorally intact.

Internal Apps is the requested source of truth for the quality baseline. Direct inspection of its current HEAD `1a102a492d8f1de692023d977afb9d48c00d9457` establishes Biome `2.5.6`, CrapTS `0.1.1`, tabs, double quotes, recommended lint rules, import organization, and strict CRAP thresholds of maximum score 30 with at most 20 violations. Its Quality CI also contains product-specific environment, build, boundary, component, E2E, classification, and deployment checks that do not port to this repository.

The validation orchestration was reverified against Internal Apps HEAD `5be88a6453416c70c6a554563b94ac257ac71afe`: one shared command list drives a sequential local `validate:all`, CI runs the same constituents in parallel, a stable final `Validate All` job aggregates them, and a focused contract test prevents drift. Docker build remains independent from that aggregate.

## Goals / Non-Goals

**Goals:**

- Make the remaining PR #8 code mechanically readable and locally reproducible before feature implementation resumes.
- Adopt only the verified portable portion of Internal Apps Quality CI.
- Separate browser assets using the existing Bun/runtime model and no UI framework.
- Preserve the current behavior and dirty work through test-first, mechanical changes.

**Non-Goals:**

- Copying Internal Apps product, framework, generated-client, deployment, or provider-specific checks.
- Redesigning the dashboard, changing API behavior, or advancing `improve-command-deck` Groups 3–7.
- Mutating GitHub branch protection, required checks, provider settings, deployments, or production.
- Introducing a bundler, frontend framework, monorepo abstraction, or speculative module hierarchy.

## Decisions

### Record the verified portable source baseline

Record the verified Internal Apps source SHA, package versions, scripts, Biome configuration, CrapTS thresholds, Quality CI workflow, and exclusions. Port Biome `2.5.6`, CrapTS `0.1.1`, the formatter/linter rules, and equivalent format/lint/check/typecheck/test/CRAP gates. Exclude Internal Apps-specific generated-route, React/Vite, environment-contract, server-boundary, component/E2E, classification, build, and deployment machinery unless this repository independently requires it.

Alternative rejected: selecting familiar defaults from memory would create false parity and turn the quality gate into an unreviewed policy change.

### Use one shared validation contract locally and in CI

Expose one canonical `validate:all` package script backed by a shared ordered command list. Run that list sequentially for local validation, run the same constituents in parallel from a clean CI checkout, and aggregate them under one stable `Validate All` job. Add one focused contract test that proves the CI command set equals the shared list and that CI does not rerun the sequential bundle. Tools are project dependencies invoked through Bun; no contributor-global installation is required. Keep Docker build, tooling freshness, strict OpenSpec validation, and `git diff --check` as separate gates, and keep provider-side required-check configuration outside this code change.

Alternative rejected: duplicating an aggregate command in CI serializes independent checks and wastes time; hand-maintained local and CI command lists drift.

### Migrate the compatible test suite to Vitest for real CrapTS coverage

CrapTS `0.1.1` consumes Istanbul/V8 `coverage-final.json`; Bun `1.3.14` emits only text or LCOV. All 11 current test files import only `expect` and `test` from `bun:test`, with one compatible `test.skipIf`, and Mongo tests already isolate files with unique guarded database names. Migrate those imports to pinned Vitest `4.1.10` with `@vitest/coverage-v8` `4.1.10`, run one permanent test runner, and emit the same V8 JSON contract Internal Apps uses. Replace tested `Bun.file` reads with Node-compatible file primitives as the shell is extracted. Do not retain a second runner or fabricate an LCOV converter.

Alternatives rejected: complexity-only or zero-coverage CRAP scores do not represent the metric Internal Apps enforces; a custom LCOV converter creates unowned coverage semantics; two permanent runners invite behavioral drift.

### Extract static browser source without adding a build system

Move authored HTML, CSS, browser JavaScript, manifest, and service worker into dedicated files under `src/web`. Serve them with Node-compatible file/response primitives and preserve the current URLs, content types, versioning, and cache policy. Keep image/license assets in their existing governed location. The production Dockerfile copies `src`, `assets`, and `tsconfig.json`, which Bun requires at runtime to resolve the repository's `#/*` aliases; CI imports the server from the built image so a build-only check cannot hide a startup failure.

Alternative rejected: a frontend framework or bundler solves a problem this application does not have and would multiply configuration before improving readability.

### Separate mechanical cleanup from semantic edits

Capture focused behavior tests first. Apply the verified formatter mechanically, then make only the extractions needed for CrapTS or clear responsibility boundaries. Keep deployment status ordering in one shared helper and preserve every authorization and isolation path. Review formatting/extraction separately from later Command Deck features even though all changes publish in PR #8.

Alternative rejected: mixing feature work into the cleanup makes both harder to review and obscures regressions.

### Gate remaining PR #8 implementation on this change

`improve-command-deck` Groups 1–2 remain completed. Groups 3–7 do not resume until this change passes its full local quality gate, focused behavior tests, strict OpenSpec validation, and user review checkpoint. Both OpenSpec changes remain PR-owned and publish together in intended PR #8.

## Risks / Trade-offs

- [Vitest changes test scheduling] → Keep tests non-concurrent within files, retain UUID Mongo databases across files, and compare the migrated suite against the captured Bun baseline before removing the Bun test script.
- [Initial formatting creates a large diff] → Keep it mechanical, scoped, and behavior-tested before responsibility extractions.
- [CrapTS flags legacy complexity broadly] → Simplify authored code at shared boundaries; use only narrow documented exceptions with removal conditions.
- [Extracted assets break runtime or Docker packaging] → Add route/content/cache tests and verify the production build artifact locally.
- [Tooling versions drift] → Pin versions in the lockfile and record the verified source revision.

## Migration Plan

1. Record the verified authoritative portable baseline and prove the coverage contract.
2. Add pinned tools, configuration, local scripts, and CI without provider-side mutation.
3. Add preservation tests, extract browser assets, and mechanically format/simplify source.
4. Run the full quality gate and strict OpenSpec validation, then stop for review.
5. Add and verify the canonical local/CI `validate:all` parity contract before the combined PR #8 handoff.
6. Resume or complete `improve-command-deck` work only under that validated quality contract.

Rollback removes the new scripts/config/workflow and restores the behavior-equivalent source layout; no data or external-system migration is involved.
