## Why

Core GitHub and webhook paths are compressed into multi-thousand-character lines, while the application shell is embedded in `server.ts` and the repository has no formatter or linter. The remaining PR #8 work cannot be reviewed safely until the repository adopts a readable, enforced quality baseline.

## What Changes

- Verify the current portable Quality CI contract from `Crisp-Inc/internal-apps`, including Biome and CrapTS, before selecting versions, rules, or thresholds.
- Add the smallest applicable formatting, linting, complexity/quality, typecheck, and test checks to local scripts and CI without copying Internal Apps-specific product checks.
- Separate the browser shell assets from `server.ts` using the repository's existing runtime and native static responses, without adding a UI framework or changing behavior.
- Mechanically format the high-risk GitHub, event, access, and server paths, then make only the smallest readability extractions required to satisfy the verified quality contract.
- Preserve the current PR #8 behavior diff and prove the refactor is behavior-neutral with existing and focused tests.
- Publish this PR-owned OpenSpec in the same intended PR #8 and complete it before resuming `improve-command-deck` Groups 3–7.

## Capabilities

### New Capabilities

- `code-quality-governance`: Reviewable source structure and a locally reproducible CI quality gate derived from the verified portable Internal Apps baseline.

### Modified Capabilities

None. Browser-asset extraction is behavior-preserving implementation work; the existing installable-PWA contract remains unchanged.

## Impact

- Affects package scripts and lockfile, CI configuration, formatter/quality configuration, `server.ts`, extracted browser assets, dense GitHub/event modules, tests, and contributor documentation.
- Adds only tooling dependencies proven necessary by the verified Internal Apps Quality CI baseline.
- Does not change provider behavior, production configuration, GitHub App permissions, deployment state, user data, or external systems.
