## Context

The current default branch at `4f228ca` has no tracked Mex configuration or references. The active checkout has a healthy local CodeGraph index, and `.dockerignore` already excludes `.codegraph/` and OpenSpec material from the application image. Repository validation is `bun run typecheck`, `bun test`, and strict OpenSpec validation.

An installed `mex-agent` 0.7.0 package cache declares Node.js 22.5 or newer, but its cached CLI cannot currently resolve all declared dependencies and `mex` is not on `PATH`. The implementation must therefore prove an official supported launcher before generating files; a nearby repository's output is precedent, not a template to copy.

## Goals / Non-Goals

**Goals:**

- Establish a minimal, source-verified Mex scaffold for stable project knowledge.
- Give Mex and CodeGraph non-overlapping, explicit responsibilities.
- Make generated-file review and artifact disposition executable gates.
- Preserve the repository's application, deployment, and production boundaries.

**Non-Goals:**

- Adding Mex to `package.json`, `bun.lock`, the application image, or runtime code.
- Adding MCP integration, update automation, or custom maintenance wrappers.
- Changing `.codegraph/`, CodeGraph installation/configuration, deployment, credentials, production state, or unrelated MongoDB work.

## Decisions

### Use the official CLI, pinned at execution time

Run the official `mex-agent` launcher with an explicit stable version and record the version that actually executes. Do not copy another repository's generated scaffold or manually imitate failed generator output.

Alternative considered: add `mex-agent` as a Bun development dependency. Rejected because Mex is repository tooling, not part of the application dependency graph, and the canonical sibling setup keeps it separate.

### Generate first, curate only after review

The first implementation group will run the supported repository-mode setup against the current checkout, inventory every changed path, verify generated claims against repository sources, assign committed/ignored/removed dispositions, and stop for human review. Manual curation and final validation form the next group.

Alternative considered: generate and immediately polish the files. Rejected because it hides generator errors inside manual edits and defeats the explicit review boundary.

### Retain the smallest durable knowledge surface

The intended durable surface is a router plus concise knowledge for architecture, stack, conventions, decisions, setup, and reusable patterns. Generator prompts, caches, logs, and local state are ignored or removed. A root instruction file is added only if the validated Mex workflow needs a thin pointer to the router; it SHALL NOT duplicate routed content.

Alternative considered: commit every generated file. Rejected because machine-local and operational artifacts are noise with a short half-life.

### Keep Mex and CodeGraph independent

Mex owns curated knowledge and routing. CodeGraph remains the first structural lookup tool under the existing healthy local `.codegraph/` workflow. Neither tool initializes, configures, or vendors the other.

Alternative considered: encode CodeGraph data or policy inside Mex. Rejected because the tools solve different problems and coupling them creates two sources of truth.

### Run the native freshness check in CI

Expose the pinned Mex check as `knowledge:check` and run it in a standalone `tooling-freshness` workflow on every push and pull request. Match the proven Internal Apps stale thresholds. CI checks only; it never runs sync, edits knowledge, commits, or pushes.

Alternative considered: add update automation or a custom wrapper. Rejected because the native check already provides the required gate and updates need review.

## Risks / Trade-offs

- [Official launcher remains unavailable or broken] → Stop before generation and report the exact version and dependency failure; do not fabricate output.
- [Generated knowledge is stale or inaccurate] → Inventory and source-check every claim before the review checkpoint, then curate only approved artifacts.
- [Local paths or secrets enter tracked Markdown] → Scan changed files for absolute home paths, credential-shaped values, and ignored local artifacts.
- [Mex duplicates repository instructions] → Keep the router and any root pointer thin; source material remains authoritative.
- [Tool responsibilities blur] → State the Mex/CodeGraph boundary in routing instructions and assert that `.codegraph/` is untouched.
- [Freshness automation rewrites curated knowledge] → Run only the native check in CI and keep sync/update commands out of the workflow.
- [Default branch advances during setup] → Record the generation baseline, refresh the feature branch before publication, and rerun validation against current `main`.

## Migration Plan

1. Verify the official pinned Mex launcher and its version without changing application dependencies.
2. Generate the repository-mode scaffold from the current checkout.
3. Inventory paths, verify claims, record dispositions, and stop for human review.
4. After approval, retain and minimally curate only durable knowledge, add only necessary ignore/routing entries, and run focused and repository validation.
5. Add the pinned check-only freshness command and CI workflow, then validate the workflow contract and repository.

Rollback is deletion of the newly added Mex artifacts and any dedicated ignore or routing lines. No application data, deployment, or external state is involved.
