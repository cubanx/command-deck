# Generated Mex Scaffold Review

## Baseline and generator

- Default branch: `main`
- Verified remote and checkout SHA: `a6c7035baa8cad43ff88a59f418a4b8afc259b3c`
- Publication base refreshed to current `main`: `4f228cab47a0603cbea8f17c55812c8584eed7a8`
- Runtime: Node.js `v26.7.0`
- Generator: official `mex-agent` `0.7.0`, invoked as `npx --yes mex-agent@0.7.0 setup --mode code-repo`
- Tool selection: Codex
- Telemetry: disabled for setup

## Generated artifact dispositions

| Path | Raw state | Proposed disposition after review |
| --- | --- | --- |
| `AGENTS.md` | Generic Mex anchor with placeholders and Mex-graph-first instructions | Commit after replacing it with a thin pointer that preserves repository CodeGraph-first instructions and routes stable knowledge to `.mex/ROUTER.md` |
| `.mex/config.json` | Valid non-secret scaffold identity and `codex` tool selection | Commit; record the validated CLI version in curated setup knowledge rather than inventing a config field |
| `.mex/ROUTER.md` | Canonical routing template with an empty project-state section | Commit after source-backed minimal population |
| `.mex/AGENTS.md` | Canonical project identity and command template | Commit after source-backed minimal population; keep the root `AGENTS.md` as the thin tool anchor |
| `.mex/SETUP.md` | Generic legacy population guide that references absent `.mex/setup.sh` | Remove; the official pinned CLI and curated `context/setup.md` cover setup |
| `.mex/SYNC.md` | Generic legacy guide that references absent `.mex/sync.sh` | Remove; use native pinned Mex commands directly when maintenance is needed |
| `.mex/context/architecture.md` | Annotated empty template | Commit after source-backed minimal population |
| `.mex/context/stack.md` | Annotated empty template | Commit after source-backed minimal population |
| `.mex/context/conventions.md` | Annotated empty template | Commit after source-backed minimal population |
| `.mex/context/decisions.md` | Annotated empty template | Commit after source-backed minimal population |
| `.mex/context/setup.md` | Annotated empty template | Commit after source-backed minimal population, including Mex `0.7.0` |
| `.mex/patterns/README.md` | Generic pattern-authoring template that encourages speculative pattern creation | Commit only after reducing it to the repository's evidence-driven pattern rule |
| `.mex/patterns/INDEX.md` | Empty canonical index | Commit; keep empty until a recurring project-specific pattern exists |
| `.mex/graph.db` | Mex's generated local structural database | Ignore as machine-local state; do not confuse it with or copy it into `.codegraph/` |

No prompts, caches, logs, event files, hooks, or other local artifacts were generated.

## Claim audit

- The raw context and routing files contain annotations and placeholders, not accepted project claims; every placeholder requires source-backed replacement in Group 2.
- The generated root and `.mex/AGENTS.md` files say to prefer Mex's graph over source inspection. That conflicts with this repository's existing CodeGraph-first instruction and must be replaced by an explicit division: CodeGraph for structural lookup, Mex for curated memory. Mex's own graph remains local implementation data needed by native Mex checks and grounding.
- `.mex/SETUP.md` and `.mex/SYNC.md` prescribe scripts the generator did not create. They are inaccurate for this installation and are proposed for removal.
- The generated `config.json` contains only the selected AI tool, a random scaffold identity, the repository name, and null origin/upstream fields. It contains no credential or local path.
- The generated pattern guide's fixed starter-pattern bias is unnecessary here. No project-specific pattern should be added until real repeated work justifies it.

## Boundary checks

- `package.json`, `bun.lock`, application source, tests, Docker/Railway inputs, and existing tracked files were not modified by setup.
- `.codegraph/` remained ignored and its before/after archive SHA-256 stayed `7b3844b8276f12f473890749dbd8a91f6bcfc2f465eff5736fc4181b39f917ff`.
- Generated repository paths contain no `/Users/` absolute paths.
- No credential-shaped assignments were found in the generated artifacts.
- Setup performed no deployment, provider mutation, credential access, production action, Git hook installation, global Mex installation, or unrelated MongoDB work.

## Group 2 result

- Applied every approved disposition: curated the retained knowledge, removed `.mex/SETUP.md` and `.mex/SYNC.md`, and ignored `.mex/graph.db`.
- Preserved CodeGraph-first structural lookup and kept Mex as curated project memory.
- Native Mex 0.7.0 validation reports a drift score of 100 with no issues.
- Typecheck, the 48-test disposable-MongoDB suite, strict OpenSpec validation, and `git diff --check` pass.
