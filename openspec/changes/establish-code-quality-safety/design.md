## Context

The repository has TypeScript typechecking and tests but no formatter, linter, `.editorconfig`, complexity gate, or general Quality CI workflow. `src/events.ts` and `src/github.ts` contain lines longer than 1,500 and 2,000 characters, respectively, and `src/server.ts` embeds the authored HTML, CSS, browser JavaScript, manifest, and service worker in string literals. The current worktree also contains reviewed OpenSpec artifacts and uncommitted Group 2 deployment-ordering work that must remain behaviorally intact.

Internal Apps is the requested source of truth for the quality baseline. Direct inspection of its current HEAD `1a102a492d8f1de692023d977afb9d48c00d9457` establishes Biome `2.5.6`, CrapTS `0.1.1`, tabs, double quotes, recommended lint rules, import organization, and strict CRAP thresholds of maximum score 30 with at most 20 violations. Its Quality CI also contains product-specific environment, build, boundary, component, E2E, classification, and deployment checks that do not port to this repository.

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

### Use one local quality entrypoint and one equivalent CI job

Expose the verified component commands plus one aggregate package script. CI installs from the lockfile and runs the aggregate gate. Tools are project dependencies invoked through Bun; no contributor-global installation is required. Provider-side required-check configuration remains outside this code change.

Alternative rejected: several loosely related CI jobs can drift from local validation and make failures harder to reproduce in this small repository.

### Migrate the compatible test suite to Vitest for real CrapTS coverage

CrapTS `0.1.1` consumes Istanbul/V8 `coverage-final.json`; Bun `1.3.14` emits only text or LCOV. All 11 current test files import only `expect` and `test` from `bun:test`, with one compatible `test.skipIf`, and Mongo tests already isolate files with unique guarded database names. Migrate those imports to pinned Vitest `4.1.10` with `@vitest/coverage-v8` `4.1.10`, run one permanent test runner, and emit the same V8 JSON contract Internal Apps uses. Replace tested `Bun.file` reads with Node-compatible file primitives as the shell is extracted. Do not retain a second runner or fabricate an LCOV converter.

Alternatives rejected: complexity-only or zero-coverage CRAP scores do not represent the metric Internal Apps enforces; a custom LCOV converter creates unowned coverage semantics; two permanent runners invite behavioral drift.

### Extract static browser source without adding a build system

Move authored HTML, CSS, browser JavaScript, manifest, and service worker into dedicated files under `src/web`. Serve them with Node-compatible file/response primitives and preserve the current URLs, content types, versioning, and cache policy. Keep image/license assets in their existing governed location. The production Dockerfile already copies both `src` and `assets`, so this layout requires no new packaging root or `COPY` instruction.

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
5. Resume `improve-command-deck` Group 3 only after approval.

Rollback removes the new scripts/config/workflow and restores the behavior-equivalent source layout; no data or external-system migration is involved.
