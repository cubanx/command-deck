## Why

The repository has no durable Mex project knowledge, so agents must reconstruct stable context from source and documentation on each task. Add the smallest supported Mex setup while preserving CodeGraph as the separate structural-code index.

## What Changes

- Initialize Mex from the current repository with the official supported `mex-agent` tooling and record the validated version.
- Review every generated claim before retaining a minimal routed knowledge scaffold for architecture, stack, conventions, decisions, setup, and reusable patterns.
- Define ownership and routing so Mex stores curated project knowledge while CodeGraph remains the first tool for structural code lookup.
- Record which Mex files are committed, ignored, or removed; exclude caches, logs, prompts, and machine-local state.
- Check committed Mex knowledge freshness on every push and pull request without mutating repository files.
- Stop after the generated scaffold and disposition are reviewed before manually curating or adopting maintenance automation.

## Capabilities

### New Capabilities

- `project-knowledge-memory`: Defines the repository's curated Mex knowledge, routing, ownership, lifecycle, and coexistence with CodeGraph.

### Modified Capabilities

None.

## Impact

- Adds repository-only Mex configuration and Markdown knowledge under `.mex/`, the minimum repository instruction pointer needed to route agents to it, and a check-only CI freshness job.
- Uses Mex as development tooling only; it does not enter the Bun application dependency graph, container image, Railway deployment, credentials, production configuration, or runtime behavior.
- Leaves `.codegraph/` and existing CodeGraph behavior unchanged.
